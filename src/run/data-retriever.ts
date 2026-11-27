import { PeriodType } from "../shared/constants";
import { marketData } from "../providers/market-data";
import { ICandleDataMap } from "../types/back-test-types";
import {
  IAllStockNames,
  IStockData,
  IStockDataBackTest
} from "../types/data-processing-types";

export class DataRetriever {
  static async getData(
    screenPeriods: number[],
    names: Partial<IAllStockNames>,
  ) {
    return this.getDataInIntervals(screenPeriods, names);
  }

  public static getDataBackTest(
    datetime: number,
    candleData: ICandleDataMap,
  ): IStockDataBackTest[] {
    const retVal: IStockDataBackTest[] = [];
    const candleTracker: Record<string, boolean> = {};

    for (const symbol of Object.keys(candleData)) {
      const { candles } = candleData[symbol];
      let { index } = candleData[symbol];
      // Move index to the first candle with datetime greater than or equal to the given datetime
      while (candles[index] && datetime > candles[index].datetime) {
        index++;
      }

      // If no valid candle is found, continue to the next symbol
      if (!candles[index]) continue;

      // Update the index in the original candleData
      candleData[symbol].index = index;

      if (candleTracker[symbol]) {
        console.log(
          "Already tracked:",
          symbol + " at " + new Date(datetime).toLocaleString(),
        );
      }

      // If the candle's datetime matches and hasn't been tracked yet, add to the result
      if (datetime === candles[index].datetime && !candleTracker[symbol]) {
        candleTracker[symbol] = true;
        retVal.push({
          price: candles[index].close,
          symbol,
          datetime,
          volume: candles[index].volume,
          open: candles[index].open,
          close: candles[index].close,
          high: candles[index].high,
          low: candles[index].low,
        });
      }
    }

    return retVal;
  }

  /** Quotes for every symbol the given periods screen; the provider handles batching. */
  public static async getDataInIntervals(
    screenPeriods: number[],
    uniqueStockNames: Partial<IAllStockNames>,
  ): Promise<IStockData[]> {
    const symbols = this.getUniqueStocks(screenPeriods, uniqueStockNames);
    const quotes = await marketData().getQuotes(symbols);
    console.log("Got all results:", quotes.length);
    return quotes;
  }

  private static getUniqueStocks(
    screenPeriods: PeriodType[],
    uniqueStockNames: Partial<IAllStockNames>,
  ): string[] {
    const stocks = screenPeriods.flatMap((idx) => uniqueStockNames[idx]);
    return [...new Set(stocks.filter((stock): stock is string => !!(stock && stock.trim())))];
  }
}
