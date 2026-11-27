import { INewAlert } from "../shared/services/repos/alert-repository";

export interface ISignal {
  runId: number;
  strategyName: string;
  symbol: string;
  long: boolean;
  price: number;
  /** The bar's time. */
  time: number;
  /** Whether the data provider's terms allow showing prices (`capabilities.displayPrices`). */
  showPrices: boolean;
}

export interface IExitSignal extends ISignal {
  /** Gain on the position in percent; positive is a profit, for shorts too. */
  gainPercent: number;
  /**
   * Why it closed: an exit signal, the session's end, an earlier session's close missed while the
   * app was down (closed at this bar instead), or the screener that entered it was removed.
   */
  reason: "signal" | "session-end" | "missed-close" | "screener-removed";
}

const when = (time: number) =>
  `${new Date(time).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`;
const side = (long: boolean) => (long ? "long" : "short");
const signed = (percent: number) => `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;

/** The alert for entering a position. */
export const entryAlert = (s: ISignal): INewAlert => {
  const subject = `${s.strategyName}: entered ${side(s.long)} ${s.symbol}`;
  const at = s.showPrices ? ` at ${s.price.toFixed(2)}` : "";
  return {
    kind: "entry",
    runId: s.runId,
    subject,
    body: `${subject}${at} (${when(s.time)})`,
    dedupKey: `entry:${s.runId}:${s.symbol}:${s.long ? "BUY" : "SELL_SHORT"}:${s.time}`,
  };
};

const REASONS: Record<IExitSignal["reason"], string> = {
  signal: "exit signal",
  "session-end": "closed at the end of the session",
  "missed-close": "closed now: the app was down or paused at the end of the session it was entered in",
  "screener-removed": "closed now: the screener that entered it was removed from the strategy",
};

/** The alert for exiting a position, with its gain and why it closed. */
export const exitAlert = (s: IExitSignal): INewAlert => {
  const subject = `${s.strategyName}: exited ${side(s.long)} ${s.symbol} (${signed(s.gainPercent)})`;
  const at = s.showPrices ? ` at ${s.price.toFixed(2)}` : "";
  const reason = REASONS[s.reason];
  return {
    kind: "exit",
    runId: s.runId,
    subject,
    body: `${s.strategyName}: exited ${side(s.long)} ${s.symbol}${at}, ${signed(s.gainPercent)}, ${reason} (${when(s.time)})`,
    dedupKey: `exit:${s.runId}:${s.symbol}:${s.time}`,
  };
};
