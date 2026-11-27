import { PeriodType } from "../shared/constants";
import { IFilter } from "../types/strategy-types";
import { IndicatorSpec, InvalidSpecError, keyOf, validateSpec } from "./specs";

/**
 * A variable a strategy reads. `spec` is absent for values the strategy owns
 * itself (position-derived: percentGain, timeSinceEntry).
 */
export interface FilterVariable {
  name: string;
  spec?: IndicatorSpec;
}

/** Variables computed from the strategy's own open position, not by the engine. */
export const POSITION_VARIABLES = new Set(["percentGain", "timeSinceEntry"]);

export class UnsupportedVariableError extends InvalidSpecError {}

type Params = IFilter & Record<string, unknown>;

function num(f: Params, ...fields: string[]): number {
  for (const field of fields) {
    const v = f[field];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  throw new InvalidSpecError(`${f.varName}: missing ${fields.join(" or ")}`);
}

function numOr(f: Params, fallback: number, ...fields: string[]): number {
  for (const field of fields) {
    const v = f[field];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return fallback;
}

const isBullish = (f: Params) => f.bullish !== false && f.bullish !== "false";

/** The spec for a filter's own variable (not its compare var). */
function specFor(f: Params, strategyPeriod: PeriodType): IndicatorSpec | undefined {
  switch (f.varName) {
    case "price":
    case "volume":
    case "time":
      return { kind: f.varName };
    case "percentGain":
    case "timeSinceEntry":
      return undefined;
    case "percentchange":
      return { kind: "percentChange", bars: num(f, "timeAgo") };
    case "priceSma":
      return { kind: "sma", source: "price", bars: num(f, "timeAgo") };
    case "volumeSma":
      return { kind: "sma", source: "volume", bars: num(f, "timeAgo") };
    case "priceEma":
      return { kind: "ema", bars: num(f, "timeAgo") };
    case "rsi":
      return { kind: "rsi", bars: num(f, "timeAgo", "period") };
    case "bollingerBands":
      return {
        kind: "bollinger",
        bars: num(f, "period", "timeAgo"),
        multiplier: numOr(f, 2, "multiplier"),
        band: f.band === "lower" || f.band === "middle" ? f.band : "upper",
      };
    case "bollingerUpper":
    case "bollingerLower":
      return {
        kind: "bollinger",
        bars: num(f, "timeAgo", "period"),
        multiplier: numOr(f, 2, "multiplier"),
        band: f.varName === "bollingerUpper" ? "upper" : "lower",
      };
    case "macd":
      return { kind: "macd", fast: num(f, "fastPeriod"), slow: num(f, "slowPeriod") };
    case "macdSignal":
    case "macdSignalLine":
      return {
        kind: "macdSignal",
        fast: num(f, "fastPeriod"),
        slow: num(f, "slowPeriod"),
        signal: numOr(f, 9, "signalPeriod"),
      };
    case "macdCrossover":
      return {
        kind: "macdCrossover",
        fast: num(f, "fastPeriod"),
        slow: num(f, "slowPeriod"),
        signal: numOr(f, 9, "signalPeriod"),
        before: num(f, "periodsBefore"),
        after: num(f, "periodsAfter"),
        bullish: isBullish(f),
      };
    case "rsiCrossover":
      return {
        kind: "rsiCrossover",
        bars: num(f, "period", "timeAgo"),
        level: numOr(f, 50, "crossoverLevel"),
        before: num(f, "periodsBefore"),
        after: num(f, "periodsAfter"),
        bullish: isBullish(f),
      };
    case "rsiDivergence":
      return {
        kind: "rsiDivergence",
        bars: num(f, "period", "timeAgo"),
        lookback: num(f, "lookback"),
        bullish: isBullish(f),
      };
    case "macdDivergence":
      return {
        kind: "macdDivergence",
        fast: num(f, "fastPeriod"),
        slow: num(f, "slowPeriod"),
        lookback: num(f, "lookback"),
        bullish: isBullish(f),
      };
    case "vwap":
      return { kind: "vwap", barPeriod: numOr(f, strategyPeriod, "timeAgo", "vwapPeriod") };
    case "mtsi":
      return {
        kind: "mtsi",
        m: num(f, "emaPeriod1"),
        n: num(f, "emaPeriod2"),
        vwapPeriod: num(f, "vwapPeriod"),
      };
    case "tsi":
      return { kind: "tsi", m: num(f, "emaPeriod1"), n: num(f, "emaPeriod2") };
    case "pricePercentChangePercentile":
      return {
        kind: "percentChangePercentile",
        bars: num(f, "timeAgo", "period"),
        sessions: numOr(f, 20, "numberOfSessions", "lookback"),
      };
    default:
      throw new UnsupportedVariableError(
        `Unsupported variable "${f.varName}"`,
      );
  }
}

function variable(f: Params, strategyPeriod: PeriodType): FilterVariable {
  const spec = specFor(f, strategyPeriod);
  if (!spec) return { name: f.varName };
  validateSpec(spec, strategyPeriod);
  return { name: keyOf(spec), spec };
}

/** The filter's own variable: the value it compares. */
export function primaryVariable(filter: IFilter, strategyPeriod: PeriodType): FilterVariable {
  return variable(filter as Params, strategyPeriod);
}

/** The variable on the right-hand side of the comparison, if any. */
export function compareVariable(
  filter: IFilter,
  strategyPeriod: PeriodType,
): FilterVariable | undefined {
  if (!filter.compareVar) return undefined;
  return variable(
    {
      ...(filter as Params),
      varName: filter.compareVar,
      timeAgo: filter.compareVarTimeAgo ?? "",
    },
    strategyPeriod,
  );
}

/** Every variable a filter reads, primary first. Throws InvalidSpecError if one can't be computed. */
export function filterVariables(filter: IFilter, strategyPeriod: PeriodType): FilterVariable[] {
  const out = [primaryVariable(filter, strategyPeriod)];
  const compare = compareVariable(filter, strategyPeriod);
  if (compare) out.push(compare);
  return out;
}
