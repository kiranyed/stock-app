import { PeriodType } from "../../shared/constants";
import { ICandle, IPolygonCandle } from "../../types/back-test-types";
import { EASTERN, normalizeCandles, regularSessionOnly, requestFrequency } from "../candles";
import {
  ALL_PERIODS,
  IFetchedCandles,
  IProviderCapabilities,
  IQuote,
  MarketDataProvider,
} from "../market-data-provider";
import { MassiveClient } from "./massive-client";

const SNAPSHOT_BATCH_SIZE = 250;

export const transformCandles = (candles: IPolygonCandle[]): ICandle[] =>
  candles.map((candle) => ({
    datetime: candle.t,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  }));

/**
 * Massive (formerly Polygon.io). Daily candles are stamped at midnight
 * Eastern. Not yet checked against the live service: there's no
 * subscription to test with. Snapshots and market status may need a paid plan.
 */
export class MassiveMarketData implements MarketDataProvider {
  readonly name = "massive";
  /**
   * Aggregates of any size, so every period. Treated as delayed: the individual plans that
   * start at 15-minute delayed data are the common case. Individual plans allow display to
   * the subscriber only, who is the self-hosted operator (PRODUCTION-READINESS.md §1.4).
   */
  readonly capabilities: IProviderCapabilities = { periods: ALL_PERIODS, realTime: false, displayPrices: true };

  async getCandles(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]> {
    const timespan = period === PeriodType.DAY ? "day" : "minute";
    const multiplier = String(requestFrequency(period));
    const responses = await Promise.all(
      symbols.map((symbol) =>
        MassiveClient.getAggregates(symbol, timespan, multiplier, {
          start: String(startTime),
          end: String(endTime),
        }),
      ),
    );
    return responses.map((response) => {
      const raw = transformCandles(response.results);
      // Minute aggregates include pre-market and after-hours trading.
      const candles = period === PeriodType.DAY ? raw : regularSessionOnly(raw);
      return {
        empty: candles.length === 0,
        symbol: response.ticker,
        candles: normalizeCandles(period, candles, EASTERN),
      };
    });
  }

  async getQuotes(symbols: string[]): Promise<IQuote[]> {
    const quotes: IQuote[] = [];
    for (let i = 0; i < symbols.length; i += SNAPSHOT_BATCH_SIZE) {
      const snapshots = await MassiveClient.getSnapshots(symbols.slice(i, i + SNAPSHOT_BATCH_SIZE));
      for (const s of snapshots) {
        const price = s.lastTrade?.p ?? s.min?.c ?? s.day?.c;
        const volume = s.min?.av ?? s.day?.v;
        if (price === undefined || volume === undefined) continue;
        quotes.push({ symbol: s.ticker, price, volume, totalVolume: volume, datetime: Date.now() });
      }
    }
    return quotes;
  }

  async isMarketOpen(): Promise<boolean> {
    return (await MassiveClient.getMarketStatus()) === "open";
  }
}
