import { PeriodType } from "../../shared/constants";
import { ICandle } from "../../types/back-test-types";

export interface IFetchedCandles {
  symbol: string;
  empty: boolean;
  candles: ICandle[];
}

// Shared across every daily candle in one initCandleData call; sources may shift
// easternOffsetMin when they detect a DST change on a UTC machine.
export interface IDailyAdjustContext {
  isUTC: boolean;
  easternOffsetMin: number;
}

export interface CandleSource {
  fetch(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]>;

  // Returns the candle's timestamp moved to the trading-day close, or throws.
  adjustDailyCandleTime(
    candle: ICandle,
    minsSinceEasternMidnight: number,
    context: IDailyAdjustContext,
  ): number;
}

// 30-minute candles are fetched for hourly periods and filtered down afterwards.
export const requestFrequency = (period: PeriodType): number =>
  period === PeriodType.DAY
    ? 1
    : period === PeriodType.HOUR
      ? PeriodType.THIRTY_MINUTES
      : period;

export const throwUnexpectedDailyTime = (
  mins: number,
  candle: ICandle,
): never => {
  if (mins === 570 || mins === 960) {
    throw new Error(
      `Unexpected time for daily candle adjustment, found ${mins} minutes since midnight. This should not happen.`,
    );
  }
  throw new Error(
    `Invalid time for daily candle adjustment at this time: ${new Date(candle.datetime).toISOString()}`,
  );
};
