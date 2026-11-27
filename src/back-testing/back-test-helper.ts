import { CONSTANTS, PeriodType } from "../shared/constants";
import { IAnalysisData } from "../analysis/analysis-types";
import { ICandleDataMap, ICandle, ITestConfig } from "../types/back-test-types";
import { IData } from "../types/general-types";
import { IFilter } from "../types/strategy-types";
import { IStockDataBackTest } from "../types/data-processing-types";
import { MarketDataProvider } from "../providers/market-data-provider";
import { createMarketDataProvider } from "../providers/market-data";

export class BackTestHelper {
  constructor(
    private readonly provider: Pick<MarketDataProvider, "getCandles"> = createMarketDataProvider(),
  ) {}

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

        // Move index to the first candle starting at or after datetime
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
        candleData.index = index;
        const current =
          candles[index]?.datetime === datetime ? candles[index] : undefined;

        if (period < PeriodType.DAY) {
          // The bar that closes now is the candle that started one period
          // ago. If it's missing (a gap, or the session's first minute), this
          // symbol has no bar now. Trades fill at the next candle's open, or
          // at this close when the next candle is missing.
          const prev = candles[index - 1];
          if (
            minutesSinceStart <= 0 ||
            !prev ||
            prev.datetime !== datetime - period * CONSTANTS.MILLIS_IN_MINUTE
          ) {
            continue;
          }
          map.push({
            ...prev,
            symbol,
            price: prev.close,
            tradePrice: current ? current.open : prev.close,
          });
        } else if (current) {
          // DAY candles are stamped at the trade time and fill at the close
          map.push({
            ...current,
            symbol,
            price: current.close,
            tradePrice: current.close,
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

      const transformedCandleResponses = await this.provider.getCandles(
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

        candleData[response.symbol].candles = response.candles;
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
        const filtName = `${filter.varName}${filter.timeAgo ?? ""}`;

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
