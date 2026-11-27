/**
 * Puts provider candles into the one form the engine expects. Providers call
 * these; nothing here depends on the machine's time zone.
 */
import { CONSTANTS, PeriodType } from "../shared/constants";
import { ICandle } from "../types/back-test-types";

export const EASTERN = "America/New_York";

/** The candle size to request for `period`: providers have no hourly candles that start at :30. */
export const requestFrequency = (period: PeriodType): number =>
  period === PeriodType.DAY
    ? 1
    : period === PeriodType.HOUR
      ? PeriodType.THIRTY_MINUTES
      : period;

const formatters = new Map<string, Intl.DateTimeFormat>();

interface IWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock date and time of `time` in `timeZone`. */
export const wallClock = (time: number, timeZone: string): IWallClock => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(new Date(time))) {
    parts[type] = value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
};

/** The time at which the wall clock in `timeZone` reads the given date and time. */
export const zonedTime = (
  { year, month, day, hour, minute }: IWallClock,
  timeZone: string,
): number => {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let time = wall;
  // Two passes settle the offset, including on the day it changes.
  for (let i = 0; i < 2; i++) {
    const seen = wallClock(time, timeZone);
    time += wall - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  }
  return time;
};

/**
 * Moves a daily candle to the time the engine trades daily bars: 15:59
 * Eastern on the candle's trading date. Providers stamp daily candles at
 * midnight in their own time zone (`stampZone`). Schwab stamps the current
 * day's candle at midnight Eastern instead, so that's accepted too, and the
 * trading date is taken in whichever zone the stamp is midnight. Anything else
 * is an error.
 */
export const dailyCandleTime = (datetime: number, stampZone: string): number => {
  const stamp = [stampZone, EASTERN]
    .map((zone) => wallClock(datetime, zone))
    .find((clock) => clock.hour === 0 && clock.minute === 0);
  if (!stamp) {
    throw new Error(
      `Expected a daily candle stamped at midnight ${stampZone}, got ${new Date(datetime).toISOString()}`,
    );
  }
  const tradeMinute = CONSTANTS.DAY_PERIOD_TRADE_TIME;
  return zonedTime(
    { ...stamp, hour: Math.floor(tradeMinute / 60), minute: tradeMinute % 60 },
    EASTERN,
  );
};

export const toDailyCandles = (candles: ICandle[], stampZone: string): ICandle[] =>
  candles.map((candle) => ({ ...candle, datetime: dailyCandleTime(candle.datetime, stampZone) }));

/**
 * Drops pre-market and after-hours candles: keeps those starting from 9:30
 * up to 16:00 Eastern. Eastern's offset is looked up once per UTC day, at
 * 12:00 UTC: that's after the 2:00 Eastern DST change and before the session.
 */
export const regularSessionOnly = (candles: ICandle[]): ICandle[] => {
  const offsets = new Map<number, number>();
  return candles.filter(({ datetime }) => {
    const utcDay = Math.floor(datetime / CONSTANTS.MILLIS_IN_DAY);
    let offset = offsets.get(utcDay);
    if (offset === undefined) {
      const noon = utcDay * CONSTANTS.MILLIS_IN_DAY + 12 * CONSTANTS.MILLIS_IN_HOUR;
      const wall = wallClock(noon, EASTERN);
      offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - noon;
      offsets.set(utcDay, offset);
    }
    const easternMinute =
      Math.floor((datetime + offset) / CONSTANTS.MILLIS_IN_MINUTE) % (24 * 60);
    return easternMinute >= CONSTANTS.BEGIN_TIME && easternMinute < CONSTANTS.END_TIME;
  });
};

const HALF_HOUR = 30 * CONSTANTS.MILLIS_IN_MINUTE;

/**
 * Hourly candles from 30-minute candles. Hours start at :30 Eastern (9:30,
 * 10:30, …, 15:30), so each one merges the :30 candle with the :00 candle
 * after it. Eastern offsets are whole hours, so ":30 Eastern" is ":30 UTC".
 * An hour with one half missing is built from the half that's there; the
 * last hour of the session (15:30–16:00) is only ever half.
 */
export const toHourlyCandles = (thirtyMinute: ICandle[]): ICandle[] => {
  const hours: ICandle[] = [];
  for (const candle of thirtyMinute) {
    const start =
      candle.datetime % CONSTANTS.MILLIS_IN_HOUR === HALF_HOUR
        ? candle.datetime
        : candle.datetime - HALF_HOUR;
    const last = hours[hours.length - 1];
    if (last && last.datetime === start) {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume += candle.volume;
    } else {
      hours.push({ ...candle, datetime: start });
    }
  }
  return hours;
};

/** Applies the period's normalization to candles fetched at `requestFrequency(period)`. */
export const normalizeCandles = (
  period: PeriodType,
  candles: ICandle[],
  dailyStampZone: string,
): ICandle[] =>
  period === PeriodType.DAY
    ? toDailyCandles(candles, dailyStampZone)
    : period === PeriodType.HOUR
      ? toHourlyCandles(candles)
      : candles.slice();
