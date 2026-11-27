import { CONSTANTS, PeriodType } from "../shared/constants";

/**
 * Typed settings for every value the engine can compute. A spec is built once,
 * from a filter's params, and the engine creates indicator objects from it.
 * `keyOf` turns a spec into the name strategies read the value under; nothing
 * parses that name back.
 */
export type IndicatorSpec =
  | { kind: "price" }
  | { kind: "volume" }
  | { kind: "time" }
  | { kind: "percentChange"; bars: number }
  | { kind: "sma"; source: "price" | "volume"; bars: number }
  | { kind: "ema"; bars: number }
  | { kind: "rsi"; bars: number }
  | {
      kind: "bollinger";
      bars: number;
      multiplier: number;
      band: "upper" | "middle" | "lower";
    }
  | { kind: "macd"; fast: number; slow: number }
  | { kind: "macdSignal"; fast: number; slow: number; signal: number }
  | {
      kind: "macdCrossover";
      fast: number;
      slow: number;
      signal: number;
      before: number;
      after: number;
      bullish: boolean;
    }
  | {
      kind: "rsiCrossover";
      bars: number;
      level: number;
      before: number;
      after: number;
      bullish: boolean;
    }
  | { kind: "rsiDivergence"; bars: number; lookback: number; bullish: boolean }
  | {
      kind: "macdDivergence";
      fast: number;
      slow: number;
      lookback: number;
      bullish: boolean;
    }
  | { kind: "vwap"; barPeriod: PeriodType }
  | { kind: "mtsi"; m: number; n: number; vwapPeriod: PeriodType }
  | { kind: "tsi"; m: number; n: number }
  | { kind: "percentChangePercentile"; bars: number; sessions: number };

export type SpecOf<K extends IndicatorSpec["kind"]> = Extract<
  IndicatorSpec,
  { kind: K }
>;

const dir = (bullish: boolean) => (bullish ? "Bullish" : "Bearish");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The one key producer. Every param that changes the output is in the key, and
 * no param that doesn't is, so equal keys always mean equal values.
 */
export function keyOf(spec: IndicatorSpec): string {
  switch (spec.kind) {
    case "price":
    case "volume":
    case "time":
      return spec.kind;
    case "percentChange":
      return `percentchange${spec.bars}`;
    case "sma":
      return `${spec.source}Sma${spec.bars}`;
    case "ema":
      return `priceEma${spec.bars}`;
    case "rsi":
      return `rsi${spec.bars}`;
    case "bollinger":
      return `bollingerBands${spec.bars}Multiplier${spec.multiplier}${cap(spec.band)}`;
    case "macd":
      return `macdFast${spec.fast}Slow${spec.slow}`;
    case "macdSignal":
      return `macdFast${spec.fast}Slow${spec.slow}Signal${spec.signal}`;
    case "macdCrossover":
      return `macdFast${spec.fast}Slow${spec.slow}Signal${spec.signal}${dir(spec.bullish)}CrossoverPeriodsBefore${spec.before}PeriodsAfter${spec.after}`;
    case "rsiCrossover":
      return `rsi${spec.bars}${dir(spec.bullish)}Crossover${spec.level}PeriodsBefore${spec.before}PeriodsAfter${spec.after}`;
    case "rsiDivergence":
      return `rsi${spec.bars}${dir(spec.bullish)}DivergenceLookback${spec.lookback}`;
    case "macdDivergence":
      return `macdFast${spec.fast}Slow${spec.slow}${dir(spec.bullish)}DivergenceLookback${spec.lookback}`;
    case "vwap":
      return `vwap${spec.barPeriod}`;
    case "mtsi":
      return `mtsiM${spec.m}N${spec.n}Vwap${spec.vwapPeriod}`;
    case "tsi":
      return `tsiM${spec.m}N${spec.n}`;
    case "percentChangePercentile":
      return `pricePercentChange${spec.bars}PercentileSessions${spec.sessions}`;
  }
}

/**
 * The period whose bars an indicator runs on. VWAP runs on its own bar period
 * (a 30-minute strategy can read the VWAP of 5-minute bars); everything else
 * runs on the strategy's period.
 */
export function homePeriod(
  spec: IndicatorSpec,
  strategyPeriod: PeriodType,
): PeriodType {
  return spec.kind === "vwap" ? spec.barPeriod : strategyPeriod;
}

export class InvalidSpecError extends Error {}

function positiveInt(name: string, v: number, spec: IndicatorSpec) {
  if (!Number.isInteger(v) || v < 1) {
    throw new InvalidSpecError(
      `${spec.kind}: ${name} must be a positive integer, got ${v}`,
    );
  }
}

function period(name: string, v: number, spec: IndicatorSpec) {
  if (!CONSTANTS.PERIODS.includes(v)) {
    throw new InvalidSpecError(
      `${spec.kind}: ${name} must be one of ${CONSTANTS.PERIODS.join(", ")}, got ${v}`,
    );
  }
}

/** Throws InvalidSpecError for settings the engine can't compute. */
export function validateSpec(spec: IndicatorSpec, strategyPeriod: PeriodType) {
  switch (spec.kind) {
    case "price":
    case "volume":
    case "time":
      return;
    case "percentChange":
    case "sma":
    case "ema":
    case "rsi":
      positiveInt("bars", spec.bars, spec);
      return;
    case "bollinger":
      positiveInt("bars", spec.bars, spec);
      if (!(spec.multiplier > 0)) {
        throw new InvalidSpecError(
          `bollinger: multiplier must be > 0, got ${spec.multiplier}`,
        );
      }
      return;
    case "macd":
    case "macdSignal":
    case "macdCrossover":
    case "macdDivergence":
      positiveInt("fast", spec.fast, spec);
      positiveInt("slow", spec.slow, spec);
      if (spec.fast >= spec.slow) {
        throw new InvalidSpecError(
          `${spec.kind}: fast (${spec.fast}) must be less than slow (${spec.slow})`,
        );
      }
      if (spec.kind === "macdSignal" || spec.kind === "macdCrossover") {
        positiveInt("signal", spec.signal, spec);
      }
      if (spec.kind === "macdCrossover") {
        positiveInt("before", spec.before, spec);
        positiveInt("after", spec.after, spec);
      }
      if (spec.kind === "macdDivergence") {
        positiveInt("lookback", spec.lookback, spec);
      }
      return;
    case "rsiCrossover":
      positiveInt("bars", spec.bars, spec);
      positiveInt("before", spec.before, spec);
      positiveInt("after", spec.after, spec);
      if (!Number.isFinite(spec.level)) {
        throw new InvalidSpecError(`rsiCrossover: level must be a number`);
      }
      return;
    case "rsiDivergence":
      positiveInt("bars", spec.bars, spec);
      positiveInt("lookback", spec.lookback, spec);
      return;
    case "vwap":
      period("barPeriod", spec.barPeriod, spec);
      return;
    case "mtsi":
      positiveInt("m", spec.m, spec);
      positiveInt("n", spec.n, spec);
      period("vwapPeriod", spec.vwapPeriod, spec);
      return;
    case "tsi":
      positiveInt("m", spec.m, spec);
      positiveInt("n", spec.n, spec);
      return;
    case "percentChangePercentile": {
      positiveInt("bars", spec.bars, spec);
      positiveInt("sessions", spec.sessions, spec);
      const max = CONSTANTS.MAX_PERCENTILE_SESSIONS[strategyPeriod];
      if (max !== undefined && spec.sessions > max) {
        throw new InvalidSpecError(
          `Invalid percentile window for period ${strategyPeriod}: sessions ${spec.sessions} exceeds max ${max}`,
        );
      }
      return;
    }
  }
}
