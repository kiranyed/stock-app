/* commonly used list of constants
570 is 9:30 AM, 960 is 4:00 PM*/

export enum MemoryType {
  PRICE = "price",
  VOLUME = "volume",
}
export enum PeriodType {
  MINUTE = 1,
  FIVE_MINUTES = 5,
  TEN_MINUTES = 10,
  THIRTY_MINUTES = 30,
  HOUR = 60,
  DAY = 1440,
}

export class CONSTANTS {
  static BEGIN_TIME = 570;
  static DAY_PERIOD_TRADE_TIME = 959;
  static END_TIME = 960;
  static MINS_IN_DAY = 1440;
  static MILLIS_IN_DAY = 86400000;
  static SECONDS_IN_DAY = 86400;
  static MILLIS_IN_MINUTE = 60000;
  static MILLIS_IN_HOUR = 3600000;
  static SIM_BEGIN_TIME = 585;
  static MINS_IN_HOUR = 60;
  static SIM_END_TIME = 975;
  static PERIODS: PeriodType[] = [1, 5, 10, 30, 60, 1440];
  static MEMORIES: string[] = [MemoryType.PRICE, MemoryType.VOLUME];
  static MAX_PERCENTILE_SESSIONS: Readonly<Partial<Record<PeriodType, number>>> = {
    [PeriodType.MINUTE]: 2,
    [PeriodType.FIVE_MINUTES]: 10,
    [PeriodType.TEN_MINUTES]: 20,
    [PeriodType.THIRTY_MINUTES]: 30,
  };
  static HUNDRED = 100;
  static MINUTE_BEFORE_CLOSE_TIME = 959;
  static EIGHT_AND_HALF_HOURS = 30600000;
}

export enum StrategyType {
  BACKTEST,
  SIMULATION,
}

export enum Period {
  ONE_MINUTE,
  FIVE_MINUTES,
  TEN_MINUTES,
  THIRTY_MINUTES,
  ONE_HOUR,
  ONE_DAY,
}

export enum ScreenerJobType {
  ANALYSIS,
  STRATEGY,
}

/* these are unused.  was thinking maybe it's cleaner to just import the vars directly,
rather than having to do CONSTANTS.beginTime, etc. ? */
export const BEGIN_TIME = 570;
export const END_TIME = 960;
export const DAY_PERIOD_TRADE_TIME = 959;
export const MINS_IN_DAY = 1440;
export const MILLIS_IN_DAY = 86400000;
export const MAX_STOCK_QUOTES_PER_REQUEST = 195;
