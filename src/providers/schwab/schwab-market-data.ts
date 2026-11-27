import { MAX_STOCK_QUOTES_PER_REQUEST, PeriodType } from "../../shared/constants";
import { ICandleData } from "../../types/back-test-types";
import { SchwabDataMap } from "../../types/external-data-types";
import { normalizeCandles, requestFrequency } from "../candles";
import {
  ALL_PERIODS,
  IFetchedCandles,
  IProviderCapabilities,
  IQuote,
  MarketDataProvider,
} from "../market-data-provider";
import { SchwabClient } from "./schwab-client";

/** Schwab stamps daily candles at midnight Central time. */
const DAILY_STAMP_ZONE = "America/Chicago";

export interface ISchwabLimits {
  historyBatchSize: number;
  historyBatchDelayMs: number;
  quoteBatchSize: number;
  quoteBatchDelayMs: number;
}

const DEFAULT_LIMITS: ISchwabLimits = {
  historyBatchSize: 250,
  historyBatchDelayMs: 10000,
  quoteBatchSize: MAX_STOCK_QUOTES_PER_REQUEST,
  quoteBatchDelayMs: 100,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SchwabMarketData implements MarketDataProvider {
  readonly name = "schwab";
  /**
   * Minute and daily price history, so every period (hourly comes from 30-minute candles).
   * Real-time quotes for the account holder, who is the self-hosted operator; showing them to
   * anyone else needs Schwab's commercial approval (PRODUCTION-READINESS.md §1.4).
   */
  readonly capabilities: IProviderCapabilities = { periods: ALL_PERIODS, realTime: true, displayPrices: true };
  private readonly limits: ISchwabLimits;

  constructor(limits: Partial<ISchwabLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async getCandles(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]> {
    const periodType = period === PeriodType.DAY ? "month" : "day";
    const frequencyType = periodType === "day" ? "minute" : "daily";
    const frequency = requestFrequency(period);
    const { historyBatchSize, historyBatchDelayMs } = this.limits;
    const results: ICandleData[] = [];

    for (let i = 0; i < symbols.length; i += historyBatchSize) {
      if (i > 0) await sleep(historyBatchDelayMs);
      const batch = symbols
        .slice(i, i + historyBatchSize)
        .map((symbol) =>
          SchwabClient.getPriceHistory(
            symbol,
            periodType,
            frequencyType,
            frequency,
            startTime,
            endTime ? endTime : Date.now(),
          ),
        );
      results.push(...(await Promise.all(batch)));
    }

    return results.map(({ symbol, empty, candles }) => ({
      symbol,
      empty,
      candles: empty ? [] : normalizeCandles(period, candles ?? [], DAILY_STAMP_ZONE),
    }));
  }

  /**
   * Requests in batches; a failed batch is logged and skipped. The first quote for a symbol wins.
   * Throws if every batch failed, so the caller sees the failure (an expired sign-in, an outage).
   */
  async getQuotes(symbols: string[]): Promise<IQuote[]> {
    const { quoteBatchSize, quoteBatchDelayMs } = this.limits;
    const responses: SchwabDataMap[] = [];
    let lastError: unknown;
    for (let i = 0; i < symbols.length; i += quoteBatchSize) {
      if (i > 0) await sleep(quoteBatchDelayMs);
      try {
        responses.push(await SchwabClient.getQuotes(symbols.slice(i, i + quoteBatchSize).join(",")));
      } catch (error) {
        console.error("Error retrieving stock data:", error);
        lastError = error;
      }
    }
    if (symbols.length && !responses.length) throw lastError;

    const quotes = new Map<string, IQuote>();
    for (const response of responses) {
      for (const [key, entry] of Object.entries(response ?? {})) {
        if (quotes.has(key) || !entry?.quote) continue;
        quotes.set(key, {
          volume: entry.quote.totalVolume,
          totalVolume: entry.quote.totalVolume,
          price: entry.quote.lastPrice,
          symbol: entry.symbol,
          datetime: Date.now(),
        });
      }
    }
    return [...quotes.values()];
  }

  isMarketOpen(): Promise<boolean> {
    return SchwabClient.isMarketOpen();
  }
}
