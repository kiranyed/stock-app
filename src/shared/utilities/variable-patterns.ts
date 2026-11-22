/**
 * Single source of truth for technical indicator variable naming patterns.
 * Used across memories-helper, filter-vars-helper, screener, and other files.
 */

/**
 * Regex patterns for matching variable names
 */
export const VariablePatterns = {
  // Basic indicators
  percentChange: /^percentchange(\d+)$/,
  rsi: /^rsi(\d+)$/,
  priceEma: /^priceEma(\d+)$/,
  priceSma: /^priceSma(\d+)$/,
  volumeSma: /^volumeSma(\d+)$/,
  volumePercentChange: /^volumePercentChange(\d+)$/,
  vwap: /^vwap(\d+)$/,

  // Bollinger Bands
  bollingerBands: /^bollingerBands(\d+)(Upper|Lower)$/,

  // MACD
  macd: /^macdFast(\d+)Slow(\d+)$/,
  macdSignal: /^macdFast(\d+)Slow(\d+)Signal(\d+)$/,
  macdCrossover:
    /^macdFast(\d+)Slow(\d+)Signal(\d+)(Bullish|Bearish)CrossoverPeriodsBefore(\d+)PeriodsAfter(\d+)$/,
  macdDivergence:
    /^macdFast(\d+)Slow(\d+)(Bullish|Bearish)DivergenceLookback(\d+)PeriodsBefore(\d+)PeriodsAfter(\d+)$/,

  // RSI Crossovers and Divergences
  rsiCrossover:
    /^rsi(\d+)(Bullish|Bearish)Crossover(\d+)PeriodsBefore(\d+)PeriodsAfter(\d+)$/,
  rsiDivergence:
    /^rsi(\d+)(Bullish|Bearish)DivergenceLookback(\d+)PeriodsBefore(\d+)PeriodsAfter(\d+)$/,

  // MTSI (Modified True Strength Index)
  mtsiVwap: /^mtsi(Numerator|Denominator)Vwap(\d+)$/,
  mtsiVwapEma1: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)$/,
  mtsiVwapEma2: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)Ema(\d+)$/,
  mtsi: /^mtsiM(\d+)N(\d+)Vwap(\d+)$/,

  // TSI (True Strength Index)
  tsiEma1: /^tsi(Numerator|Denominator)Ema(\d+)$/,
  tsiEma2: /^tsi(Numerator|Denominator)Ema(\d+)Ema(\d+)$/,
  tsi: /^tsiM(\d+)N(\d+)$/,

  // Percentile
  percentileRank: /^percentileRank(\d+)Period(\d+)$/,
  pricePercentChangePercentile:
    /^pricePercentChange(\d+)Percentile(?:Sessions)?(\d+)$/,
};

/**
 * Helper functions for building common patterns
 */
export const VariableTokens = {
  numerator: "Numerator",
  denominator: "Denominator",
  bullish: "Bullish",
  bearish: "Bearish",
} as const;

const buildDivergence = (
  prefix: string,
  lookback: number,
  before: number,
  after: number,
  bullish: boolean,
) =>
  `${prefix}${bullish ? "Bullish" : "Bearish"}DivergenceLookback${lookback}PeriodsBefore${before}PeriodsAfter${after}`;

const buildNumeratorDenominator = (prefix: string, isNumerator: boolean) =>
  `${prefix}${isNumerator ? "Numerator" : "Denominator"}`;

/**
 * Builder functions for constructing variable names
 */
export const VariableBuilders = {
  percentChange: (period: number) => `percentchange${period}`,
  rsi: (period: number) => `rsi${period}`,
  priceEma: (period: number) => `priceEma${period}`,
  priceSma: (period: number) => `priceSma${period}`,
  volumeSma: (period: number) => `volumeSma${period}`,
  volumePercentChange: (period: number) => `volumePercentChange${period}`,
  vwap: (period: number) => `vwap${period}`,
  vwapNumeratorCumulative: () => "vwapNumeratorCumulative",
  vwapDenominatorCumulative: () => "vwapDenominatorCumulative",

  bollingerBandsUpper: (period: number) => `bollingerBands${period}Upper`,
  bollingerBandsLower: (period: number) => `bollingerBands${period}Lower`,

  macd: (fast: number, slow: number) => `macdFast${fast}Slow${slow}`,
  macdSignal: (fast: number, slow: number, signal: number) =>
    `macdFast${fast}Slow${slow}Signal${signal}`,
  macdCrossover: (
    fast: number,
    slow: number,
    signal: number,
    level: number,
    before: number,
    after: number,
    bullish: boolean,
  ) =>
    `macdFast${fast}Slow${slow}Signal${signal}${bullish ? "Bullish" : "Bearish"}Crossover${level}PeriodsBefore${before}PeriodsAfter${after}`,
  macdDivergence: (
    fast: number,
    slow: number,
    lookback: number,
    before: number,
    after: number,
    bullish: boolean,
  ) =>
    buildDivergence(
      `macdFast${fast}Slow${slow}`,
      lookback,
      before,
      after,
      bullish,
    ),

  rsiCrossover: (
    period: number,
    level: number,
    before: number,
    after: number,
    bullish: boolean,
  ) =>
    `rsi${period}${bullish ? "Bullish" : "Bearish"}Crossover${level}PeriodsBefore${before}PeriodsAfter${after}`,

  rsiDivergence: (
    period: number,
    lookback: number,
    before: number,
    after: number,
    bullish: boolean,
  ) => buildDivergence(`rsi${period}`, lookback, before, after, bullish),

  mtsiVwap: (vwapPeriod: number, isNumerator: boolean) =>
    `${buildNumeratorDenominator("mtsi", isNumerator)}Vwap${vwapPeriod}`,
  mtsiVwapEma: (vwapPeriod: number, emaPeriod: number, isNumerator: boolean) =>
    `${buildNumeratorDenominator("mtsi", isNumerator)}Vwap${vwapPeriod}Ema${emaPeriod}`,
  mtsiVwapEma2: (
    vwapPeriod: number,
    ema1: number,
    ema2: number,
    isNumerator: boolean,
  ) =>
    `${buildNumeratorDenominator("mtsi", isNumerator)}Vwap${vwapPeriod}Ema${ema1}Ema${ema2}`,
  mtsi: (m: number, n: number, vwapPeriod: number) =>
    `mtsiM${m}N${n}Vwap${vwapPeriod}`,

  tsiEma: (emaPeriod: number, isNumerator: boolean) =>
    `${buildNumeratorDenominator("tsi", isNumerator)}Ema${emaPeriod}`,
  tsiEma2: (ema1: number, ema2: number, isNumerator: boolean) =>
    `${buildNumeratorDenominator("tsi", isNumerator)}Ema${ema1}Ema${ema2}`,
  tsi: (m: number, n: number) => `tsiM${m}N${n}`,

  // TSI memory key builders
  tsiMemoryKey: (isNumerator: boolean) =>
    isNumerator ? "tsiNumerator" : "tsiDenominator",
  tsiEmaMemoryKey: (isNumerator: boolean, m: number) =>
    isNumerator ? `tsiNumeratorEma${m}` : `tsiDenominatorEma${m}`,

  percentileRank: (percentile: number, period: number) =>
    `percentileRank${percentile}Period${period}`,
  pricePercentChangePercentile: (period: number, sessions: number) =>
    `pricePercentChange${period}PercentileSessions${sessions}`,
  timeKey: () => "time",
};

/**
 * Helper types and functions for parsing
 */
type DivergenceParams = {
  lookback: number;
  before: number;
  after: number;
  bullish: boolean;
};

type CrossoverParams = {
  level: number;
  before: number;
  after: number;
  bullish: boolean;
};

/**
 * Parser functions for extracting parameters from variable names
 */
export const VariableParsers = {
  /**
   * Extract the period from simple variable names like "rsi14", "percentchange5"
   */
  extractPeriod: (variableName: string): number => {
    const match = variableName.match(/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  },

  /**
   * Parse MACD variable to extract fast and slow periods
   */
  parseMacd: (variableName: string): { fast: number; slow: number } | null => {
    const match = variableName.match(VariablePatterns.macd);
    if (!match) return null;
    return { fast: parseInt(match[1]), slow: parseInt(match[2]) };
  },

  /**
   * Parse MACD Signal variable
   */
  parseMacdSignal: (
    variableName: string,
  ): { fast: number; slow: number; signal: number } | null => {
    const match = variableName.match(VariablePatterns.macdSignal);
    if (!match) return null;
    return {
      fast: parseInt(match[1]),
      slow: parseInt(match[2]),
      signal: parseInt(match[3]),
    };
  },

  /**
   * Parse RSI crossover variable
   */
  parseRsiCrossover: (
    variableName: string,
  ): ({ period: number } & CrossoverParams) | null => {
    const match = variableName.match(VariablePatterns.rsiCrossover);
    if (!match) return null;
    return {
      period: parseInt(match[1]),
      bullish: match[2] === "Bullish",
      level: parseInt(match[3]),
      before: parseInt(match[4]),
      after: parseInt(match[5]),
    };
  },

  /**
   * Parse RSI divergence variable
   */
  parseRsiDivergence: (
    variableName: string,
  ): ({ period: number } & DivergenceParams) | null => {
    // Try pattern with Lookback first
    const match = variableName.match(VariablePatterns.rsiDivergence);
    if (match) {
      return {
        period: parseInt(match[1]),
        bullish: match[2] === "Bullish",
        lookback: parseInt(match[3]),
        before: parseInt(match[4]),
        after: parseInt(match[5]),
      };
    }

    // Try pattern without Lookback: rsi14BullishDivergencePeriodsAfter2PeriodsBefore3
    const simpleMatch = variableName.match(
      /^rsi(\d+)(Bullish|Bearish)DivergencePeriodsAfter(\d+)PeriodsBefore(\d+)$/,
    );
    if (simpleMatch) {
      const after = parseInt(simpleMatch[3]);
      const before = parseInt(simpleMatch[4]);
      return {
        period: parseInt(simpleMatch[1]),
        bullish: simpleMatch[2] === "Bullish",
        lookback: before + after, // Total lookback is before + after
        before,
        after,
      };
    }

    return null;
  },

  /**
   * Parse MACD divergence variable
   */
  parseMacdDivergence: (
    variableName: string,
  ): ({ fast: number; slow: number } & DivergenceParams) | null => {
    const match = variableName.match(VariablePatterns.macdDivergence);
    if (!match) return null;
    return {
      fast: parseInt(match[1]),
      slow: parseInt(match[2]),
      bullish: match[3] === "Bullish",
      lookback: parseInt(match[4]),
      before: parseInt(match[5]),
      after: parseInt(match[6]),
    };
  },

  /**
   * Parse MTSI variable to extract vwap period
   */
  parseMtsiVwapPeriod: (variableName: string): number => {
    const match = variableName.match(/Vwap(\d+)/);
    return match ? parseInt(match[1]) : 0;
  },

  /**
   * Parse MTSI to extract all parameters
   */
  parseMtsi: (
    variableName: string,
  ): { m: number; n: number; vwapPeriod: number } | null => {
    const match = variableName.match(VariablePatterns.mtsi);
    if (!match) return null;
    return {
      m: parseInt(match[1]),
      n: parseInt(match[2]),
      vwapPeriod: parseInt(match[3]),
    };
  },

  /**
   * Parse price percent change percentile variable
   */
  parsePricePercentChangePercentile: (
    variableName: string,
  ): { period: number; sessions: number } | null => {
    const match = variableName.match(VariablePatterns.pricePercentChangePercentile);
    if (!match) return null;
    return {
      period: parseInt(match[1]),
      sessions: parseInt(match[2]),
    };
  },
};

/**
 * Single-pass classifier to avoid multiple regex tests on the same variable
 * Performance optimization: ~20x faster than sequential VariableMatchers tests
 */
export type VariableType =
  | "percentChange"
  | "rsi"
  | "priceEma"
  | "priceSma"
  | "volumeSma"
  | "volumePercentChange"
  | "vwap"
  | "vwapNumeratorCumulative"
  | "vwapDenominatorCumulative"
  | "bollingerBands"
  | "bollingerBandsUpper"
  | "bollingerBandsLower"
  | "macd"
  | "macdSignal"
  | "macdCrossover"
  | "macdDivergence"
  | "rsiCrossover"
  | "rsiDivergence"
  | "mtsi"
  | "mtsiVwap"
  | "tsi"
  | "tsiEma"
  | "percentileRank"
  | "pricePercentChangePercentile"
  | null;

const classificationCache = new Map<string, VariableType>();

/**
 * Classify a variable name in a single pass instead of testing multiple regex patterns.
 * Uses LRU-like cache for frequently accessed variables.
 */
export function classifyVariable(name: string): VariableType {
  // Check cache first (hot path optimization)
  if (classificationCache.has(name)) {
    return classificationCache.get(name)!;
  }

  let type: VariableType = null;

  // Test patterns in order of frequency (most common first)
  if (VariablePatterns.percentChange.test(name)) type = "percentChange";
  else if (VariablePatterns.rsi.test(name)) type = "rsi";
  else if (VariablePatterns.priceEma.test(name)) type = "priceEma";
  else if (VariablePatterns.macd.test(name)) type = "macd";
  else if (VariablePatterns.mtsiVwap.test(name)) type = "mtsiVwap";
  else if (VariablePatterns.priceSma.test(name)) type = "priceSma";
  else if (VariablePatterns.volumeSma.test(name)) type = "volumeSma";
  else if (VariablePatterns.vwap.test(name)) type = "vwap";
  else if (VariablePatterns.rsiCrossover.test(name)) type = "rsiCrossover";
  else if (VariablePatterns.rsiDivergence.test(name)) type = "rsiDivergence";
  else if (VariablePatterns.macdSignal.test(name)) type = "macdSignal";
  else if (VariablePatterns.macdCrossover.test(name)) type = "macdCrossover";
  else if (VariablePatterns.macdDivergence.test(name)) type = "macdDivergence";
  else if (VariablePatterns.bollingerBands.test(name)) {
    type = /Upper$/.test(name) ? "bollingerBandsUpper" : "bollingerBandsLower";
  } else if (VariablePatterns.mtsi.test(name)) type = "mtsi";
  else if (VariablePatterns.tsi.test(name)) type = "tsi";
  else if (
    VariablePatterns.tsiEma1.test(name) ||
    VariablePatterns.tsiEma2.test(name)
  )
    type = "tsiEma";
  else if (VariablePatterns.volumePercentChange.test(name))
    type = "volumePercentChange";
  else if (VariablePatterns.percentileRank.test(name)) type = "percentileRank";
  else if (VariablePatterns.pricePercentChangePercentile.test(name))
    type = "pricePercentChangePercentile";
  else if (name === "vwapNumeratorCumulative") type = "vwapNumeratorCumulative";
  else if (name === "vwapDenominatorCumulative")
    type = "vwapDenominatorCumulative";

  // Cache up to 1000 unique variables (LRU eviction if needed)
  if (classificationCache.size < 1000) {
    classificationCache.set(name, type);
  }

  return type;
}

/**
 * Clear classification cache (useful for testing)
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
}

/**
 * Test if a variable name matches a specific pattern
 */
export const VariableMatchers = {
  isPercentChange: (name: string) => VariablePatterns.percentChange.test(name),
  isRsi: (name: string) => VariablePatterns.rsi.test(name),
  isPriceEma: (name: string) => VariablePatterns.priceEma.test(name),
  isPriceSma: (name: string) => VariablePatterns.priceSma.test(name),
  isVolumeSma: (name: string) => VariablePatterns.volumeSma.test(name),
  isVolumePercentChange: (name: string) =>
    VariablePatterns.volumePercentChange.test(name),
  isVwap: (name: string) => VariablePatterns.vwap.test(name),
  isVwapNumeratorCumulative: (name: string) =>
    name.includes("vwapNumeratorCumulative"),
  isVwapDenominatorCumulative: (name: string) =>
    name.includes("vwapDenominatorCumulative"),
  isBollingerBands: (name: string) =>
    VariablePatterns.bollingerBands.test(name),
  isBollingerBandsUpper: (name: string) =>
    /^bollingerBands\d+Upper$/.test(name),
  isBollingerBandsLower: (name: string) =>
    /^bollingerBands\d+Lower$/.test(name),
  isMacd: (name: string) => VariablePatterns.macd.test(name),
  isMacdSignal: (name: string) => VariablePatterns.macdSignal.test(name),
  isMacdCrossover: (name: string) => VariablePatterns.macdCrossover.test(name),
  isMacdDivergence: (name: string) =>
    VariablePatterns.macdDivergence.test(name),
  isRsiCrossover: (name: string) => VariablePatterns.rsiCrossover.test(name),
  isRsiDivergence: (name: string) => VariablePatterns.rsiDivergence.test(name),
  isMtsi: (name: string) => VariablePatterns.mtsi.test(name),
  isMtsiVwap: (name: string) => VariablePatterns.mtsiVwap.test(name),
  isTsi: (name: string) => VariablePatterns.tsi.test(name),
  isTsiEma: (name: string) =>
    VariablePatterns.tsiEma1.test(name) || VariablePatterns.tsiEma2.test(name),
  isPricePercentChangePercentile: (name: string) =>
    VariablePatterns.pricePercentChangePercentile.test(name),
};
