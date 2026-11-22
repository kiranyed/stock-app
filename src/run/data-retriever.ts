import { MAX_STOCK_QUOTES_PER_REQUEST, PeriodType } from "../shared/constants";
import { SchwabAPI } from "../shared/services/trading-api";
import { ICandleDataMap } from "../types/back-test-types";
import {
  IAllStockNames,
  IStockData,
  IStockDataBackTest
} from "../types/data-processing-types";
import { SchwabDataMap } from "../types/external-data-types";

export class DataRetriever {
  /* both yahoo and TD apis only allow you to get data for certain amount of stocks per request, and usually have to wait
    a second or two between each request  */

  static async getData(
    screenPeriods: number[],
    names: Partial<IAllStockNames>,
  ) {
    return this.getDataInIntervals(screenPeriods, names);
  }

  private convertTDData(map: SchwabDataMap[]): IStockData[] {
    const tempMap: SchwabDataMap = {};
    for (const item of map) {
      for (const key of Object.keys(item)) {
        tempMap[key] = item[key];
      }
    }
    const retVal = [
      ...Object.keys(tempMap).map((key) => ({ ...tempMap[key], symbol: key })),
    ];
    return retVal.map(({ quote: { lastPrice, totalVolume }, symbol }) => ({
      volume: totalVolume,
      price: lastPrice,
      symbol,
      datetime: Date.now(),
    }));
  }

  private static convertSchwabData(maps: SchwabDataMap[]) {
    const tempMap: SchwabDataMap = {};
    for (const item of maps) {
      for (const key of Object.keys(item)) {
        if (!tempMap[key]) {
          tempMap[key] = item[key];
        }
      }
    }
    return Object.keys(tempMap)
      .map((key) => tempMap[key])
      .filter(
        (
          val,
        ): val is SchwabDataMap[string] & {
          quote: { totalVolume: number; lastPrice: number };
        } => Boolean(val?.quote),
      )
      .map((val) => ({
        volume: val.quote.totalVolume,
        totalVolume: val.quote.totalVolume,
        price: val.quote.lastPrice,
        symbol: val.symbol,
        datetime: Date.now(),
      }));
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
          open: candles[index].volume,
          close: candles[index].close,
          high: candles[index].high,
          low: candles[index].low,
        });
      }
    }

    return retVal;
  }

  public static async getDataInIntervals(
    screenPeriods: number[],
    uniqueStockNames: Partial<IAllStockNames>,
  ): Promise<IStockData[]> {
    const stocksArr = this.getUniqueStocks(screenPeriods, uniqueStockNames);
    const { retrievalIntervalTime, increment } = this.getRetrievalParams();

    const results: Array<SchwabDataMap> = [];

    for (let index = 0; index < stocksArr.length; index += increment) {
      if (index > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, retrievalIntervalTime));
      }
      const stockBatch = stocksArr.slice(index, index + increment);
      if (stockBatch.length === 0) {
        console.log(`No stocks to retrieve in batch starting at index ${index}`);
        continue;
      }
      await this.retrieveData(stockBatch, results);
    }

    const reducedResults = this.convertSchwabData(results);
    console.log("Got all results:", reducedResults.length);
    return reducedResults;
  }

  private static getUniqueStocks(
    screenPeriods: PeriodType[],
    uniqueStockNames: Partial<IAllStockNames>,
  ): string[] {
    const stocks = screenPeriods.flatMap((idx) => uniqueStockNames[idx]);
    return [...new Set(stocks.filter((stock): stock is string => !!(stock && stock.trim())))];
  }

  // don't know what the limits are for Schwab's API, need to test
  private static getRetrievalParams() {
    return {
      retrievalIntervalTime: 100,
      increment: MAX_STOCK_QUOTES_PER_REQUEST,
      isReal: false,
    };
  }

  private static async retrieveData(
    stockBatch: string[],
    results: Array<SchwabDataMap>,
  ): Promise<void> {
    try {
      const data = await SchwabAPI.getStockDataMultiple(stockBatch.join(","));
      results.push(data);
    } catch (error) {
      console.error("Error retrieving stock data:", error);
    }
  }
}
