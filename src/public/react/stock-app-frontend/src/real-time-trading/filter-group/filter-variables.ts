/*
 * The variables a filter can use, and the params each one needs. This mirrors
 * the backend's src/engine/filter-specs.ts: a variable missing there throws
 * when the strategy loads, so don't offer one here that isn't handled there.
 * The backend test src/tests/engine/frontend-filter-variables.test.ts checks
 * every option against the engine, so this file has no imports.
 */

/** Same shape as IDropDownItem in shared/types. */
interface IOption {
  label: string;
  value: string;
}

/** Values the engine computes from bars. */
export const indicatorOptions: IOption[] = [
  { label: "Price", value: "price" },
  { label: "Volume", value: "volume" },
  { label: "Percent change", value: "percentchange" },
  {
    label: "Percent change percentile rank",
    value: "pricePercentChangePercentile",
  },
  { label: "SMA", value: "priceSma" },
  { label: "EMA", value: "priceEma" },
  { label: "Volume SMA", value: "volumeSma" },
  { label: "VWAP", value: "vwap" },
  { label: "Bollinger Bands", value: "bollingerBands" },
  { label: "RSI", value: "rsi" },
  { label: "MACD line", value: "macd" },
  { label: "MACD signal line", value: "macdSignalLine" },
  { label: "MTSI", value: "mtsi" },
  { label: "TSI", value: "tsi" },
];

/** True/false signals; a filter on one of these is "is true". */
export const signalOptions: IOption[] = [
  { label: "RSI Crossover", value: "rsiCrossover" },
  { label: "MACD crossover", value: "macdCrossover" },
  { label: "RSI Divergence", value: "rsiDivergence" },
  { label: "MACD Divergence", value: "macdDivergence" },
];

/** Values from the strategy's own open position; only exits can read them. */
export const positionOptions: IOption[] = [
  { label: "Time since entry (number of periods)", value: "timeSinceEntry" },
  { label: "Percent gain since purchase", value: "percentGain" },
];

export const entryOptions = [...indicatorOptions, ...signalOptions];
export const exitOptions = [...entryOptions, ...positionOptions];
/** Analysis scenario filters and the variable check run on the same engine. */
export const analysisOptions = entryOptions;
/** The analysis "variables to retrieve" only computes percent change (also into the future). */
export const analysisDataOptions: IOption[] = [
  { label: "Percent change", value: "percentchange" },
];

/** Bar periods the engine accepts for VWAP and MTSI (CONSTANTS.PERIODS, minus DAY). */
export const barPeriodOptions: IOption[] = [
  { label: "1 minute", value: "1" },
  { label: "5 minutes", value: "5" },
  { label: "10 minutes", value: "10" },
  { label: "30 minutes", value: "30" },
  { label: "60 minutes", value: "60" },
];

export const isSignalVariable = (varName: string) =>
  signalOptions.some((o) => o.value === varName);

/**
 * Params the engine requires for each variable: any one of the listed fields
 * (the engine reads them in this order), with a label for messages. `timeAgo`
 * is per side: the compare variable reads `compareVarTimeAgo`. Every other
 * param is shared by both sides of a filter (filter-specs.ts `compareVariable`
 * copies the filter and replaces only `timeAgo`).
 */
type Required = [fields: string[], label: string][];
const bars = (label = "period"): Required => [[["timeAgo"], label]];
const macdPeriods: Required = [
  [["fastPeriod"], "fast period"],
  [["slowPeriod"], "slow period"],
];
const REQUIRED: Record<string, Required> = {
  percentchange: bars("number of periods"),
  pricePercentChangePercentile: [[["timeAgo", "period"], "number of periods"]],
  priceSma: bars(),
  priceEma: bars(),
  volumeSma: bars(),
  rsi: [[["timeAgo", "period"], "period"]],
  bollingerBands: [[["period", "timeAgo"], "period"]],
  macd: macdPeriods,
  macdSignalLine: macdPeriods,
  macdCrossover: [
    ...macdPeriods,
    [["periodsBefore"], "periods before"],
    [["periodsAfter"], "periods after"],
  ],
  rsiCrossover: [
    [["period", "timeAgo"], "RSI period"],
    [["periodsBefore"], "periods before"],
    [["periodsAfter"], "periods after"],
  ],
  rsiDivergence: [
    [["period", "timeAgo"], "RSI period"],
    [["lookback"], "lookback"],
  ],
  macdDivergence: [...macdPeriods, [["lookback"], "lookback"]],
  mtsi: [
    [["emaPeriod1"], "M period"],
    [["emaPeriod2"], "N period"],
    [["vwapPeriod"], "VWAP period"],
  ],
  tsi: [
    [["emaPeriod1"], "M period"],
    [["emaPeriod2"], "N period"],
  ],
};

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

/** Labels of the params a variable still needs, or [] when it has them all. */
export function missingParams(
  filter: object,
  varName: string,
  compareSide = false,
): string[] {
  const params = filter as unknown as Record<string, unknown>;
  const read = (field: string) =>
    params[compareSide && field === "timeAgo" ? "compareVarTimeAgo" : field];
  return (REQUIRED[varName] ?? [])
    .filter(([fields]) => fields.every((f) => isBlank(read(f))))
    .map(([, label]) => label);
}

/** True unless the filter says `bullish: false` (the engine's default is bullish). */
export const isBullish = (value: unknown) =>
  value !== false && value !== "false";
