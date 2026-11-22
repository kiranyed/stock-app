/**
 * Shared variable calculation functions used by both memories-helper and filter-vars-helper
 */
import { IHistogramData } from "../../types/data-processing-types";

const HISTOGRAM_NUM_BINS = 20;
const HISTOGRAM_MIN = -20;
const HISTOGRAM_MAX = 20;
const HISTOGRAM_BIN_WIDTH = (HISTOGRAM_MAX - HISTOGRAM_MIN) / HISTOGRAM_NUM_BINS; // 2% per bin

/**
 * Build a 20-bin histogram of percent changes over [-20%, +20%].
 * Values outside this range are clipped to the nearest edge bin.
 */
export function buildHistogram(values: number[]): IHistogramData {
  const binEdges: number[] = [];
  for (let i = 0; i <= HISTOGRAM_NUM_BINS; i++) {
    binEdges.push(HISTOGRAM_MIN + i * HISTOGRAM_BIN_WIDTH);
  }
  const counts = new Array<number>(HISTOGRAM_NUM_BINS).fill(0);
  let totalCount = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const clipped = Math.max(HISTOGRAM_MIN, Math.min(HISTOGRAM_MAX, v));
    const idx =
      clipped === HISTOGRAM_MAX
        ? HISTOGRAM_NUM_BINS - 1
        : Math.floor((clipped - HISTOGRAM_MIN) / HISTOGRAM_BIN_WIDTH);
    counts[idx]++;
    totalCount++;
  }
  return { binEdges, counts, totalCount };
}

/**
 * Estimate percentile rank [0, 100] of `value` from a pre-built histogram.
 * Uses linear interpolation within the matched bin.
 */
export function estimatePercentileFromHistogram(
  value: number,
  histogram: IHistogramData,
): number {
  const { binEdges, counts, totalCount } = histogram;
  if (totalCount === 0 || !Number.isFinite(value)) return NaN;
  const numBins = counts.length;
  let below = 0;
  for (let i = 0; i < numBins; i++) {
    const binLow = binEdges[i];
    const binHigh = binEdges[i + 1];
    if (value >= binHigh) {
      below += counts[i];
    } else if (value >= binLow) {
      const fraction = (value - binLow) / (binHigh - binLow);
      below += counts[i] * fraction;
      break;
    }
  }
  return (below / totalCount) * 100;
}


export function calculateMtsiNumerator(price: number, vwap: number): number {
  return Math.log(price / vwap);
}

/**
 * Calculate MTSI denominator: abs(log(price / vwap))
 */
export function calculateMtsiDenominator(price: number, vwap: number): number {
  return Math.abs(Math.log(price / vwap));
}

/**
 * Calculate MACD: fast EMA - slow EMA
 */
export function calculateMacd(fastEma: number, slowEma: number): number {
  return fastEma - slowEma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param currentValue - The current value to include in EMA
 * @param previousEma - The previous EMA value (or undefined for first calculation)
 * @param period - The EMA period
 * @param fallbackValues - Array of values to use for initial SMA calculation if previousEma is undefined
 */
export function calculateEma(
  currentValue: number,
  previousEma: number | undefined,
  period: number,
  fallbackValues?: number[],
): number {
  const multiplier = 2 / (period + 1);

  if (previousEma !== undefined && !isNaN(previousEma)) {
    return previousEma * (1 - multiplier) + currentValue * multiplier;
  } else if (fallbackValues && fallbackValues.length >= period) {
    // Initial EMA calculation using SMA
    return fallbackValues.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  return NaN;
}

/**
 * Calculate MTSI EMA for numerator or denominator
 */
/**
 * Calculate MTSI EMA for numerator or denominator
 */
export function calculateMtsiEma(
  currentValue: number,
  previousEma: number | undefined,
  period: number,
  fallbackList?: number[],
): number {
  if (previousEma !== undefined && !isNaN(previousEma)) {
    // Use incremental EMA calculation
    return calculateEma(currentValue, previousEma, period);
  } else if (fallbackList && fallbackList.length > 0) {
    // Use SMA for initial calculation
    const validArr = fallbackList.filter(
      (item) => !isNaN(item) && item !== undefined,
    );
    return calculateSma(validArr, period);
  }

  return NaN;
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSma(values: number[], period: number): number {
  if (values.length < period) {
    return NaN;
  }
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRsi(prices: number[], period: number): number {
  if (prices.length < period + 1) {
    return NaN;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else if (diff < 0) {
      losses += -diff;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return rsi;
}

/**
 * Calculate Bollinger Band (upper or lower)
 */
export function calculateBollingerBand(
  prices: number[],
  period: number,
  isUpper: boolean,
): number {
  if (prices.length < period) {
    return NaN;
  }

  const fullArr = prices.slice(-period);
  const middleBand = fullArr.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(
    fullArr.reduce((sum, value) => sum + Math.pow(value - middleBand, 2), 0) /
      period,
  );

  return isUpper ? middleBand + 2 * stdDev : middleBand - 2 * stdDev;
}

/**
 * Calculate percent change
 */
export function calculatePercentChange(
  currentPrice: number,
  previousPrice: number,
): number {
  return (currentPrice / previousPrice - 1) * 100;
}

/**
 * Calculate MTSI final value from numerator and denominator
 */
export function calculateMtsi(numerator: number, denominator: number): number {
  const raw = (100 * numerator) / denominator;
  const mtsiValue = Math.round(raw * 1e6) / 1e6; // 6 decimal places to avoid floating point precision issues

  // When mtsi is 100 or -100, this is the first (or one of the first values), so it is not accurate
  return mtsiValue === 100 || mtsiValue === -100 ? NaN : mtsiValue;
}

/**
 * Calculate percentile rank in [0, 100] using mid-rank tie handling.
 */
export function calculatePercentileRank(
  value: number,
  distribution: number[],
): number {
  const validDistribution = distribution.filter(
    (item) => Number.isFinite(item),
  );
  if (!Number.isFinite(value) || validDistribution.length === 0) {
    return NaN;
  }

  let below = 0;
  let equal = 0;
  for (const item of validDistribution) {
    if (item < value) {
      below++;
    } else if (item === value) {
      equal++;
    }
  }

  return ((below + 0.5 * equal) / validDistribution.length) * 100;
}
