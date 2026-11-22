import { CONSTANTS, PeriodType } from "../shared/constants";
import { IAnalysisData } from "../analysis/analysis-types";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { ICandleDataMap, ICandle, ITestConfig } from "../types/back-test-types";
import { IData } from "../types/general-types";
import { IFilter } from "../types/strategy-types";
import { IStockDataBackTest } from "../types/data-processing-types";
import {
  CandleSource,
  IDailyAdjustContext,
} from "./candle-sources/candle-source";
import { createCandleSource } from "./candle-sources/create-candle-source";

export class BackTestHelper {
  constructor(private readonly candleSource: CandleSource = createCandleSource()) {}

  candleData: Partial<Record<PeriodType, ICandleDataMap>> = {};

  /* can separate this */
  getTestData(
    datetime: number,
    periods: PeriodType[],
    minutesSinceStart: number,
  ) {
    const retVal: Partial<Record<PeriodType, IStockDataBackTest[]>> = {};

    // Iterate through each period type in candleData
    for (const period of periods) {
      const candleDataMap = this.candleData[period];
      if (!candleDataMap) {
        continue;
      }
      retVal[period] = [];
      const map = retVal[period];
      // Iterate through each symbol in the candle data map for the current period
      for (const [symbol, candleData] of Object.entries(candleDataMap)) {
        if (!candleData || !candleData.candles) {
          continue;
        }

        const { candles } = candleData;
        let { index } = candleData;

        // Skip if there are no candles at the current index
        if (!candles[index]) {
          continue;
        }

        // Move index forward until the datetime is less than or equal to the candle's datetime
        while (candles[index] && datetime > candles[index].datetime) {
          if (
            Math.abs(candles[index].datetime - datetime) <
            CONSTANTS.MILLIS_IN_MINUTE
          ) {
            throw new Error(
              "datetime should've been normalized to the minute, but found a candle within a minute of the datetime. This should not happen.",
            );
          }
          index++;
        }

        // Update the index in the candle data
        candleData.index = index;

        // Skip if there are no candles at the updated index
        if (!candles[index]) {
          continue;
        }

        // If the datetime matches and the symbol hasn't been processed yet
        if (datetime === candles[index].datetime) {
          // we get the previous candle's close price.
          // TODO need to validate that the previous candle has the right datetime
          let candleToCopy: ICandle | undefined;
          if (period < PeriodType.DAY) {
            if (minutesSinceStart > 0) {
              candleToCopy = candles[index - 1];
            }
          } else {
            candleToCopy = candles[index];
          }

          if (!candleToCopy) continue;
          // Add the candle data to the return array
          map.push({
            ...candleToCopy,
            symbol,
            price: candleToCopy.close,
            tradePrice:
              period === PeriodType.DAY
                ? candleToCopy.close
                : candles[index].open,
            high: candleToCopy.high,
            low: candleToCopy.low,
          });
        }
      }
    }

    return retVal;
  }

  public async initCandleData(
    config: ITestConfig,
    periods: PeriodType[],
    allNames: string[],
  ) {
    const { startTime, endTime } = config;
    const allCandleDataMaps: Partial<Record<PeriodType, ICandleDataMap>> = {};
    const debugCandles = process.env.BACKTEST_DEBUG_CANDLES === "1";

    const now = new Date();
    const isUTC = Intl.DateTimeFormat().resolvedOptions().timeZone === "UTC";
    const easternDate = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    const dailyAdjustContext: IDailyAdjustContext = {
      isUTC,
      easternOffsetMin: Math.round(
        (now.getTime() - easternDate.getTime()) / 60000,
      ),
    };

    for (const period of periods) {
      const candleData: ICandleDataMap = {};

      // Initialize candle data for all symbols
      for (const name of allNames) {
        candleData[name] = {
          empty: false,
          symbol: name,
          candles: new Array<ICandle>(),
          index: 0,
        };
      }

      const transformedCandleResponses = await this.candleSource.fetch(
        period,
        allNames,
        startTime,
        endTime,
      );

      //Process responses and populate candle data

      for (const response of transformedCandleResponses) {
        if (response.empty) {
          delete candleData[response.symbol];
          continue;
        }

        if (period === PeriodType.DAY) {
          // Adjust datetime for daily candles to reflect market close time
          candleData[response.symbol].candles = response.candles
            .slice()
            .map((candle) => {
              const date = new Date(candle.datetime);

              const mins =
                (1440 +
                  60 * date.getHours() +
                  date.getMinutes() -
                  dailyAdjustContext.easternOffsetMin) %
                1440;
              return {
                ...candle,
                datetime: this.candleSource.adjustDailyCandleTime(
                  candle,
                  mins,
                  dailyAdjustContext,
                ),
              };
            });
        } else if (period === PeriodType.HOUR) {
          // Filter candles to create hourly candles from 30-minute candles
          candleData[response.symbol].candles = response.candles
            .slice()
            .filter((item) => item.datetime % CONSTANTS.MILLIS_IN_HOUR !== 0);
        } else {
          candleData[response.symbol].candles = response.candles.slice();
        }
      }

      // Assign the processed candle data to the map for the current period
      allCandleDataMaps[period] = candleData;

      if (debugCandles) {
        const symbolCount = Object.keys(candleData).length;
        const zeroCandles = Object.values(candleData).filter(
          (entry) => (entry?.candles?.length ?? 0) === 0,
        ).length;
        const missing = allNames.length - symbolCount;

        console.log("[BACKTEST_DEBUG_CANDLES]", {
          period,
          requestedSymbols: allNames.length,
          loadedSymbols: symbolCount,
          zeroCandleSymbols: zeroCandles,
          droppedSymbols: missing,
        });
      }
    }

    this.candleData = allCandleDataMaps; // Update the class property if needed
    return allCandleDataMaps;
  }

  collectData(
    scenarios: IAnalysisData[],
    periodLength: PeriodType,
    dataFilters: IFilter[],
  ) {
    if (!this.candleData[periodLength]) {
      throw new Error(
        `Candle data for period length ${periodLength} is not initialized.`,
      );
    }

    const analysisData = new Array<IData>();

    for (const scenario of scenarios) {
      const symbol = scenario.symbol;

      const specificData = this.candleData[periodLength][symbol];
      const idx = specificData.index;
      const curPrice = specificData.candles[idx].close;

      const analysisObj: IData = {
        time: scenario.time,
        symbol: scenario.symbol,
        price: curPrice,
      };

      Object.assign(analysisObj, scenario.variableValues);
      //analysisObj.filtName = filtName;
      for (const filter of dataFilters) {
        const filtName = StrategyUtil.convertToVariableName(filter);

        const candles = specificData.candles;

        switch (filter.varName) {
          case "percentchange": {
            /* if price is a future price, timeAgo will be a negative value*/
            if (!filter.timeAgo) {
              throw new Error("timeAgo is not defined");
            }
            const timeAgo = parseInt(filter.timeAgo, 10);
            const timeAgoInMillis =
              timeAgo * periodLength * CONSTANTS.MILLIS_IN_MINUTE;
            const isFuture = timeAgo < 0;
            let i = 0;
            while (
              candles[idx - i] &&
              (isFuture
                ? candles[idx - i].datetime + timeAgoInMillis < scenario.time
                : candles[idx - i].datetime + timeAgoInMillis > scenario.time)
            ) {
              i += isFuture ? -1 : 1;
            }

            if (
              candles[idx - i] &&
              candles[idx - i].datetime + timeAgoInMillis === scenario.time
            ) {
              const comparePrice = candles[idx - i].close;
              let val;
              val =
                timeAgo < 0 ? comparePrice / curPrice : curPrice / comparePrice;
              val = parseFloat((CONSTANTS.HUNDRED * (val - 1)).toFixed(2));
              analysisObj[filtName] = val;
            }
            break;
          }
          default:
            break;
        }
      }
      analysisData.push({ ...analysisObj });
    }
    return analysisData;
  }
}
