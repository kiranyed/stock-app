import { CONSTANTS } from "../shared/constants";

/**
 * A readable description of every variable a filter can use and the params it
 * reads, for clients that build strategies (the MCP server's resource, later
 * strategy creation). filter-specs.ts is what actually reads the params; the
 * test src/tests/engine/variable-catalog.test.ts keeps the two in step.
 */

export interface IVariableParam {
  name: string;
  description: string;
  required: boolean;
  /** The value the engine uses when the param is left out. */
  default?: string | number | boolean;
  /** The only values accepted, when there is a fixed set. */
  values?: (string | number | boolean)[];
  /** A valid value, used in examples and tests. */
  example: string;
}

export interface IVariableInfo {
  varName: string;
  label: string;
  /**
   * value: a number to compare. signal: 1 when the condition holds, else 0;
   * use operator "=" and compareVal "1". position: from the strategy's own
   * open position, so exit filters only.
   */
  kind: "value" | "signal" | "position";
  description: string;
  params: IVariableParam[];
}

const barPeriods = CONSTANTS.PERIODS.map(Number);

const param = (
  name: string,
  description: string,
  example: string,
  extra: Partial<IVariableParam> = {},
): IVariableParam => ({ name, description, required: true, example, ...extra });

const bars = (description: string, example = "14") =>
  param("timeAgo", description, example);
const fast = param("fastPeriod", "Fast EMA length in bars.", "12");
const slow = param("slowPeriod", "Slow EMA length in bars; must be greater than fastPeriod.", "26");
const signalPeriod = param("signalPeriod", "Signal line EMA length in bars.", "9", {
  required: false,
  default: 9,
});
const bullish = param(
  "bullish",
  "true for the bullish signal, false for the bearish one.",
  "true",
  { required: false, default: true, values: [true, false] },
);
const before = param("periodsBefore", "Bars the line must have been on the starting side.", "2");
const after = param("periodsAfter", "Bars it must have stayed on the other side, ending now.", "1");
const rsiBars = param("period", "RSI length in bars (`timeAgo` is also read).", "14");
const lookback = param("lookback", "Window, in bars, searched for the two most recent pivots.", "20");

export const VARIABLES: IVariableInfo[] = [
  { varName: "price", label: "Price", kind: "value", description: "Close of the bar.", params: [] },
  { varName: "volume", label: "Volume", kind: "value", description: "Volume of the bar.", params: [] },
  {
    varName: "time",
    label: "Time of day",
    kind: "value",
    description: "Minutes since 9:30 Eastern at the bar's close time.",
    params: [],
  },
  {
    varName: "percentchange",
    label: "Percent change",
    kind: "value",
    description: "Percent change of the close over the last `timeAgo` bars (5 means 5%).",
    params: [bars("Number of bars to look back.", "2")],
  },
  {
    varName: "pricePercentChangePercentile",
    label: "Percent change percentile rank",
    kind: "value",
    description:
      "Percentile rank (0–100) of the latest `timeAgo`-bar percent change among such changes in the last `numberOfSessions` sessions. Intraday, changes that span the overnight gap are left out.",
    params: [
      param("timeAgo", "Bars the change is measured over (`period` is also read).", "2"),
      param("numberOfSessions", "Sessions in the ranking window (`lookback` is also read).", "5", {
        required: false,
        default: 20,
        description: `Sessions in the ranking window (\`lookback\` is also read). At most ${Object.entries(
          CONSTANTS.MAX_PERCENTILE_SESSIONS,
        )
          .map(([p, max]) => `${max} for ${p}-minute bars`)
          .join(", ")}.`,
      }),
    ],
  },
  { varName: "priceSma", label: "SMA", kind: "value", description: "Simple moving average of the close.", params: [bars("Length in bars.", "20")] },
  { varName: "priceEma", label: "EMA", kind: "value", description: "Exponential moving average of the close.", params: [bars("Length in bars.", "20")] },
  { varName: "volumeSma", label: "Volume SMA", kind: "value", description: "Simple moving average of volume.", params: [bars("Length in bars.", "20")] },
  {
    varName: "vwap",
    label: "VWAP",
    kind: "value",
    description:
      "Session VWAP on typical price, computed on bars of `timeAgo` minutes (a 30-minute strategy can read the VWAP of 5-minute bars).",
    params: [
      param("timeAgo", "Bar period in minutes (`vwapPeriod` is also read).", "5", {
        required: false,
        default: "the strategy's period",
        values: barPeriods,
      }),
    ],
  },
  {
    varName: "bollingerBands",
    label: "Bollinger Bands",
    kind: "value",
    description: "One Bollinger band: SMA ± multiplier × standard deviation of the close.",
    params: [
      param("period", "Length in bars (`timeAgo` is also read).", "20"),
      param("multiplier", "Standard deviations from the SMA.", "2", { required: false, default: 2 }),
      param("band", "Which band.", "lower", {
        required: false,
        default: "upper",
        values: ["upper", "middle", "lower"],
      }),
    ],
  },
  {
    varName: "rsi",
    label: "RSI",
    kind: "value",
    description: "Relative Strength Index (Wilder's smoothing), 0–100.",
    params: [param("timeAgo", "Length in bars (`period` is also read).", "14")],
  },
  { varName: "macd", label: "MACD line", kind: "value", description: "Fast EMA − slow EMA of the close.", params: [fast, slow] },
  {
    varName: "macdSignalLine",
    label: "MACD signal line",
    kind: "value",
    description: "EMA of the MACD line (`macdSignal` is the same variable).",
    params: [fast, slow, signalPeriod],
  },
  {
    varName: "mtsi",
    label: "MTSI",
    kind: "value",
    description: "Double-smoothed ratio of ln(close / VWAP), −100 to +100.",
    params: [
      param("emaPeriod1", "First smoothing length (m).", "25"),
      param("emaPeriod2", "Second smoothing length (n).", "13"),
      param("vwapPeriod", "Bar period of the VWAP, in minutes.", "5", { values: barPeriods }),
    ],
  },
  {
    varName: "tsi",
    label: "TSI",
    kind: "value",
    description: "True Strength Index on 1-bar changes of the close, −100 to +100.",
    params: [
      param("emaPeriod1", "First smoothing length (m).", "25"),
      param("emaPeriod2", "Second smoothing length (n).", "13"),
    ],
  },
  {
    varName: "macdCrossover",
    label: "MACD crossover",
    kind: "signal",
    description:
      "The MACD line was on one side of its signal line for `periodsBefore` bars, then on the other for the `periodsAfter` bars ending now (below to above when bullish).",
    params: [bullish, fast, slow, signalPeriod, before, after],
  },
  {
    varName: "rsiCrossover",
    label: "RSI crossover",
    kind: "signal",
    description:
      "RSI was on one side of `crossoverLevel` for `periodsBefore` bars, then on the other for the `periodsAfter` bars ending now (below to above when bullish).",
    params: [
      bullish,
      rsiBars,
      param("crossoverLevel", "The RSI level crossed.", "30", { required: false, default: 50 }),
      before,
      after,
    ],
  },
  {
    varName: "rsiDivergence",
    label: "RSI divergence",
    kind: "signal",
    description:
      "Over the last `lookback` bars, the two latest pivot lows have a lower close but a higher RSI (bullish), or the two latest pivot highs a higher close but a lower RSI (bearish).",
    params: [bullish, rsiBars, lookback],
  },
  {
    varName: "macdDivergence",
    label: "MACD divergence",
    kind: "signal",
    description: "Like RSI divergence, with the MACD line in place of RSI.",
    params: [bullish, fast, slow, lookback],
  },
  {
    varName: "percentGain",
    label: "Percent gain since entry",
    kind: "position",
    description: "Percent gain of the open position (5 means 5%). Exit filters only.",
    params: [],
  },
  {
    varName: "timeSinceEntry",
    label: "Bars since entry",
    kind: "position",
    description: "Bars since the open position was entered. Exit filters only.",
    params: [],
  },
];

/** Everything a client needs to write filters: the variables plus the filter format. */
export const variableCatalog = () => ({
  variables: VARIABLES,
  filter: {
    description:
      "A filter compares a variable with a constant or with a second variable. Params go on the filter object itself, as strings.",
    fields: {
      varName: "The variable (one of `variables[].varName`).",
      operator: "One of >, >=, <, <=, =, !=.",
      compareVal: 'A number, as a string. Used when compareVar is empty. For a signal, use operator "=" and compareVal "1".',
      compareVar: "Optional: a second variable to compare against instead of compareVal.",
      compareVarCoefficient: 'Optional multiplier for compareVar, as a string (default "1").',
      compareVarTimeAgo:
        "The compare variable's `timeAgo` (its length, or VWAP's bar period). Every other param is shared by both sides of the filter.",
    },
    example: {
      varName: "price",
      operator: "<",
      compareVal: "",
      compareVar: "bollingerBands",
      compareVarCoefficient: "1",
      period: "20",
      band: "lower",
    },
  },
  filterGroup: {
    description:
      "{ filters: IFilter[], connectors: string[] }. connectors[i] joins filters[i] and filters[i + 1]: AND or OR, evaluated left to right without precedence.",
  },
  periods: {
    description: "Strategy bar periods in minutes (1440 is a day).",
    values: barPeriods,
  },
  notes: [
    "When the filter's own variable is exactly 0, the filter is false whatever the operator (known issue), so a signal can't be tested for 0.",
    "A variable that is NaN (not enough bars yet, or after a gap for windowed indicators) makes its filter false.",
    "Unknown variables and invalid params are rejected when the strategy loads.",
  ],
});
