import fs from "fs";
import path from "path";
import { CONSTANTS, PeriodType } from "../../shared/constants";
import { ICandle } from "../../types/back-test-types";
import { IFetchedCandles, IProviderCapabilities, IQuote, MarketDataProvider } from "../market-data-provider";

/**
 * Serves candles saved earlier from a real provider (util/load-test/record-candles.ts),
 * so the app can run without a data account or network: load tests, offline work.
 * Files are `<dir>/<period>/<SYMBOL>.json`, each an array of already-normalized candles.
 * There are no live quotes, and the market is always closed.
 */
export class RecordedMarketData implements MarketDataProvider {
  readonly name = "recorded";
  private readonly cache = new Map<string, ICandle[]>();

  constructor(private readonly dir = process.env.RECORDED_CANDLES_DIR) {
    if (!dir) {
      throw new Error("RECORDED_CANDLES_DIR is not set (the recorded data provider reads candles from it).");
    }
  }

  static file(dir: string, period: PeriodType, symbol: string): string {
    return path.join(dir, String(period), `${symbol}.json`);
  }

  /**
   * The periods that have recordings (a `<dir>/<period>` folder), read each time so a
   * recording made after startup counts. No live quotes. The files are copies of another
   * provider's data, for load tests and offline work, so their prices aren't for showing.
   */
  get capabilities(): IProviderCapabilities {
    const dir = this.dir as string;
    const folders = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const periods = CONSTANTS.PERIODS.filter((p) => folders.includes(String(p)));
    return { periods, realTime: false, displayPrices: false };
  }

  async getCandles(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]> {
    return symbols.map((symbol) => {
      const candles = this.load(period, symbol).filter(
        (c) => c.datetime >= startTime && c.datetime <= endTime,
      );
      return { symbol, empty: candles.length === 0, candles };
    });
  }

  async getQuotes(): Promise<IQuote[]> {
    return [];
  }

  async isMarketOpen(): Promise<boolean> {
    return false;
  }

  private load(period: PeriodType, symbol: string): ICandle[] {
    const file = RecordedMarketData.file(this.dir as string, period, symbol);
    let candles = this.cache.get(file);
    if (!candles) {
      candles = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : [];
      this.cache.set(file, candles as ICandle[]);
    }
    return candles as ICandle[];
  }
}
