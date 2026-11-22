import {
  calculateMtsiNumerator,
  calculateMtsiDenominator,
  calculateMacd,
  calculateEma,
  calculateMtsiEma,
  calculateSma,
  calculateRsi,
  calculateBollingerBand,
  calculatePercentChange,
  calculateMtsi,
  calculatePercentileRank,
} from "../../../shared/utilities/variable-calculations";

describe("variable-calculations", () => {
  describe("calculateMtsiNumerator", () => {
    it("should calculate log(price / vwap)", () => {
      const result = calculateMtsiNumerator(100, 95);
      expect(result).toBeCloseTo(Math.log(100 / 95), 5);
    });

    it("should handle equal price and vwap", () => {
      const result = calculateMtsiNumerator(100, 100);
      expect(result).toBe(0);
    });
  });

  describe("calculateMtsiDenominator", () => {
    it("should calculate abs(log(price / vwap))", () => {
      const result = calculateMtsiDenominator(90, 100);
      expect(result).toBeCloseTo(Math.abs(Math.log(90 / 100)), 5);
    });
  });

  describe("calculateMacd", () => {
    it("should calculate fastEma - slowEma", () => {
      const result = calculateMacd(12.5, 10.2);
      expect(result).toBeCloseTo(2.3, 5);
    });

    it("should handle negative MACD", () => {
      const result = calculateMacd(10, 12);
      expect(result).toBe(-2);
    });
  });

  describe("calculateEma", () => {
    it("should calculate incremental EMA with previousEma", () => {
      const result = calculateEma(105, 100, 12);
      const multiplier = 2 / (12 + 1);
      const expected = 100 * (1 - multiplier) + 105 * multiplier;
      expect(result).toBeCloseTo(expected, 5);
    });

    it("should calculate initial SMA when previousEma is undefined", () => {
      const values = [
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
      ];
      const result = calculateEma(112, undefined, 12, values);
      const expected = values.reduce((a, b) => a + b, 0) / 12;
      expect(result).toBeCloseTo(expected, 5);
    });

    it("should return NaN when insufficient data", () => {
      const result = calculateEma(100, undefined, 12, [100, 101]);
      expect(result).toBeNaN();
    });

    it("should return NaN when previousEma is NaN", () => {
      const result = calculateEma(105, NaN, 12);
      expect(result).toBeNaN();
    });
  });

  describe("calculateMtsiEma", () => {
    it("should use incremental calculation with previousEma", () => {
      const result = calculateMtsiEma(0.05, 0.03, 12);
      const multiplier = 2 / (12 + 1);
      const expected = 0.03 * (1 - multiplier) + 0.05 * multiplier;
      expect(result).toBeCloseTo(expected, 5);
    });

    it("should calculate SMA for initial value", () => {
      const values = [
        0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12,
      ];
      const result = calculateMtsiEma(0.13, undefined, 12, values);
      const expected = values.reduce((a, b) => a + b, 0) / 12;
      expect(result).toBeCloseTo(expected, 5);
    });

    it("should filter out NaN values before SMA calculation", () => {
      const values = [
        0.01,
        NaN,
        0.03,
        0.04,
        0.05,
        0.06,
        0.07,
        0.08,
        0.09,
        0.1,
        0.11,
        0.12,
        0.13,
      ];
      const result = calculateMtsiEma(0.14, undefined, 12, values);
      const validValues = values.filter((v) => !isNaN(v));
      const expected = validValues.slice(-12).reduce((a, b) => a + b, 0) / 12;
      expect(result).toBeCloseTo(expected, 5);
    });
  });

  describe("calculateSma", () => {
    it("should calculate simple moving average", () => {
      const values = [100, 101, 102, 103, 104];
      const result = calculateSma(values, 5);
      expect(result).toBe(102);
    });

    it("should use only last period values", () => {
      const values = [50, 100, 101, 102, 103, 104];
      const result = calculateSma(values, 5);
      expect(result).toBe(102);
    });

    it("should return NaN when insufficient data", () => {
      const result = calculateSma([100, 101], 5);
      expect(result).toBeNaN();
    });
  });

  describe("calculateRsi", () => {
    it("should calculate RSI with full price array", () => {
      const prices = [
        44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
        46.03, 45.61, 46.28, 46.0,
      ];
      const result = calculateRsi(prices, 14);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });

    it("should return NaN with insufficient data", () => {
      const result = calculateRsi([100, 101, 102], 14);
      expect(result).toBeNaN();
    });
  });

  describe("calculateBollingerBand", () => {
    it("should calculate upper Bollinger Band", () => {
      const prices = [100, 101, 102, 103, 104];
      const result = calculateBollingerBand(prices, 5, true);
      expect(result).toBeGreaterThan(104);
    });

    it("should calculate lower Bollinger Band", () => {
      const prices = [100, 101, 102, 103, 104];
      const result = calculateBollingerBand(prices, 5, false);
      expect(result).toBeLessThan(100);
    });

    it("should return NaN with insufficient data", () => {
      const result = calculateBollingerBand([100, 101], 5, true);
      expect(result).toBeNaN();
    });

    it("upper band should be greater than lower band", () => {
      const prices = [100, 101, 102, 103, 104, 105, 106];
      const upper = calculateBollingerBand(prices, 5, true);
      const lower = calculateBollingerBand(prices, 5, false);
      expect(upper).toBeGreaterThan(lower);
    });

    it("should accept cached middleBand and stdDev for optimization", () => {
      const prices = [100, 101, 102, 103, 104];
      const fullArr = prices.slice(-5);
      const middleBand = fullArr.reduce((a, b) => a + b, 0) / 5;
      const stdDev = Math.sqrt(
        fullArr.reduce(
          (sum, value) => sum + Math.pow(value - middleBand, 2),
          0,
        ) / 5,
      );

      const result = calculateBollingerBand(prices, 5, true);
      expect(result).toBeCloseTo(middleBand + 2 * stdDev, 5);
    });
  });

  describe("calculatePercentChange", () => {
    it("should calculate positive percent change", () => {
      const result = calculatePercentChange(110, 100);
      expect(result).toBeCloseTo(10, 5);
    });

    it("should calculate negative percent change", () => {
      const result = calculatePercentChange(90, 100);
      expect(result).toBeCloseTo(-10, 5);
    });

    it("should handle zero previous price", () => {
      const result = calculatePercentChange(100, 0);
      expect(result).toBe(Infinity);
    });
  });

  describe("calculateMtsi", () => {
    it("should calculate MTSI value", () => {
      const result = calculateMtsi(0.05, 0.1);
      expect(result).toBeCloseTo(50, 5);
    });

    it("should return NaN when MTSI is 100", () => {
      const result = calculateMtsi(0.1, 0.1);
      expect(result).toBeNaN();
    });

    it("should return NaN when MTSI is -100", () => {
      const result = calculateMtsi(-0.1, 0.1);
      expect(result).toBeNaN();
    });

    it("should handle floating point precision", () => {
      const result = calculateMtsi(0.0123456789, 0.023456789);
      expect(typeof result).toBe("number");
      expect(result).not.toBeNaN();
    });
  });

  describe("calculatePercentileRank", () => {
    it("should calculate percentile rank with mid-rank tie handling", () => {
      const distribution = [1, 2, 2, 4, 5];
      const result = calculatePercentileRank(2, distribution);
      expect(result).toBeCloseTo(40, 5);
    });

    it("should return NaN for empty distribution", () => {
      expect(calculatePercentileRank(5, [])).toBeNaN();
    });

    it("should return NaN for non-finite value", () => {
      expect(calculatePercentileRank(NaN, [1, 2, 3])).toBeNaN();
    });
  });
});
