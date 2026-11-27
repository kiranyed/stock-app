import { CONSTANTS, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { IStockData, IStockDataBackTest } from "../types/data-processing-types";
import { BarInput, sessionOf } from "./engine";

/**
 * Periods whose bar closes at time `t`, from `periods`. Intraday periods close
 * every `period` minutes from the open; DAY closes at DAY_PERIOD_TRADE_TIME
 * (15:59 ET). Backtest and live both use this.
 */
export function duePeriods(t: number, periods: PeriodType[]): PeriodType[] {
  const minuteOfDay = StockTradeUtil.getMinutesInDayEastCoast(new Date(t));
  const sinceOpen = minuteOfDay - CONSTANTS.BEGIN_TIME;
  const inSession =
    sinceOpen >= 0 && sinceOpen < CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME;
  return periods.filter((p) =>
    p >= PeriodType.DAY
      ? minuteOfDay === CONSTANTS.DAY_PERIOD_TRADE_TIME
      : inSession && sinceOpen % p === 0,
  );
}

/** A historical candle (as BackTestHelper.getTestData returns it) as a bar. */
export function candleToBar(c: IStockDataBackTest): BarInput {
  return {
    symbol: c.symbol,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.price,
    volume: c.volume,
  };
}

/**
 * Turns live quote snapshots into bars. A quote has one price and the day's
 * cumulative volume, so a bar's volume is the change in cumulative volume
 * since the previous bar of the same period and session.
 */
export class QuoteBars {
  private lastCumulative = new Map<string, { session: string; volume: number }>();

  toBars(period: PeriodType, quotes: IStockData[], symbols: Set<string>): BarInput[] {
    const out: BarInput[] = [];
    for (const q of quotes) {
      if (!symbols.has(q.symbol)) continue;
      const session = sessionOf(q.datetime);
      const id = `${period}|${q.symbol}`;
      const last = this.lastCumulative.get(id);
      const volume =
        period >= PeriodType.DAY
          ? q.volume
          : last && last.session === session && q.volume >= last.volume
            ? q.volume - last.volume
            : q.volume;
      this.lastCumulative.set(id, { session, volume: q.volume });
      out.push({
        symbol: q.symbol,
        open: q.price,
        high: q.price,
        low: q.price,
        close: q.price,
        volume,
      });
    }
    return out;
  }
}
