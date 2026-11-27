import { CONSTANTS, PeriodType } from "../shared/constants";
import { ICandle } from "../types/back-test-types";
import { IStockData } from "../types/data-processing-types";

/** Market-data requests give up after this long, so a hung one can't stall the live minute tick. */
export const READ_TIMEOUT_MS = 30_000;

export interface IFetchedCandles {
  symbol: string;
  empty: boolean;
  candles: ICandle[];
}

/** A live quote: the last price and the day's cumulative volume so far. */
export interface IQuote extends IStockData {
  /** the day's cumulative volume (the same as `volume`) */
  totalVolume: number;
}

/**
 * What a provider's data (and its license) allows. Strategy validation, and later the UI and
 * alert emails, read these rather than the deployment profile (REFACTOR.md §6, "Two deployment
 * profiles"), so an end-of-day provider rejects intraday strategies by itself.
 */
export interface IProviderCapabilities {
  /** The bar periods it serves candles for, and so the periods a strategy may use. */
  readonly periods: readonly PeriodType[];
  /** Quotes and the latest bars are real time; false means delayed or end of day. */
  readonly realTime: boolean;
  /** Its prices may be shown to the install's users, for example in alert emails. */
  readonly displayPrices: boolean;
}

/** Every period the engine knows, for providers that serve them all. */
export const ALL_PERIODS: readonly PeriodType[] = Object.freeze([...CONSTANTS.PERIODS]);

/** "daily" or "30-minute": how a period reads in messages. */
export const periodLabel = (period: PeriodType) => (period === PeriodType.DAY ? "daily" : `${period}-minute`);

/**
 * Where the app gets market data. Every provider returns candles in the same
 * form, so nothing downstream knows which one is in use:
 * - regular-session candles only, each stamped at its start time;
 * - DAY candles stamped at 15:59 Eastern on their trading date (see candles.ts);
 * - HOUR candles built from 30-minute candles (see candles.ts).
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: IProviderCapabilities;

  getCandles(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]>;

  /** One quote per symbol that the provider knows; unknown symbols are left out. */
  getQuotes(symbols: string[]): Promise<IQuote[]>;

  /** Whether the regular US equity session is open now. */
  isMarketOpen(): Promise<boolean>;
}
