import { IFilter } from "../../types/strategy-types";

export class VariableUtil {
  public static isMACDFilter(filter: IFilter) {
    return "signalPeriod" in filter;
  }

  public static hasBullishRsiCrossover(
    rsiValues: number[],
    crossOverLevel: number,
    periodsBefore: number,
    periodsAfter: number,
  ) {
    return (
      rsiValues
        .slice(-(periodsAfter + periodsBefore), periodsBefore)
        .every((v) => v < crossOverLevel) &&
      rsiValues.slice(-periodsAfter).every((v) => v > crossOverLevel)
    );
  }

  public static hasBearishRsiCrossover(
    rsiValues: number[],
    crossOverLevel: number,
    periodsBefore: number,
    periodsAfter: number,
  ) {
    return (
      rsiValues
        .slice(-(periodsAfter + periodsBefore), periodsBefore)
        .every((v) => v > crossOverLevel) &&
      rsiValues.slice(-periodsAfter).every((v) => v < crossOverLevel)
    );
  }

  public static hasBullishDivergence(
    priceValues: number[],
    signalValues: number[],
  ) {
    // Find last two swing lows in the lookback period
    const lows = [];
    for (let i = 1; i < priceValues.length - 1; i++) {
      if (
        priceValues[i] < priceValues[i - 1] &&
        priceValues[i] < priceValues[i + 1]
      ) {
        lows.push({ index: i, price: priceValues[i], signal: signalValues[i] });
      }
    }

    // We only care about the last two swing lows
    if (lows.length < 2) return false;
    const low2 = lows[lows.length - 1];
    const low1 = lows[lows.length - 2];

    // Check divergence condition
    return low2.signal > low1.signal && low2.price < low1.price;
  }

  public static hasBearishDivergence(
    priceValues: number[],
    signalValues: number[],
  ) {
    // Find last two swing highs in the lookback period
    const highs = [];
    for (let i = 1; i < priceValues.length - 1; i++) {
      if (
        priceValues[i] > priceValues[i - 1] &&
        priceValues[i] > priceValues[i + 1]
      ) {
        highs.push({
          index: i,
          price: priceValues[i],
          signal: signalValues[i],
        });
      }
    }

    // We only care about the last two swing highs
    if (highs.length < 2) return false;
    const high2 = highs[highs.length - 1];
    const high1 = highs[highs.length - 2];

    // Check divergence condition
    return high2.price > high1.price && high2.signal < high1.signal;
  }

  public static hasBullishMacdCrossover(
    macdValues: number[],
    signalValues: number[],
    periodsBefore: number,
    periodsAfter: number,
  ) {
    return (
      macdValues
        .slice(0, periodsBefore)
        .every((v, index) => v < signalValues[index]) &&
      macdValues
        .slice(-periodsAfter)
        .every(
          (v, index) =>
            v > signalValues[signalValues.length - periodsAfter + index],
        )
    );
  }

  public static hasBearishMacdCrossover(
    macdValues: number[],
    signalValues: number[],
    periodsBefore: number,
    periodsAfter: number,
  ) {
    return (
      macdValues
        .slice(0, periodsBefore)
        .every((v, index) => v > signalValues[index]) &&
      macdValues
        .slice(-periodsAfter)
        .every(
          (v, index) =>
            v < signalValues[signalValues.length - periodsAfter + index],
        )
    );
  }
}
