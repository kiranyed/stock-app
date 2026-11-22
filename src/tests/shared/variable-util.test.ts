import { VariableUtil } from "../../shared/utilities/variable-util";

describe("VariableUtil", () => {
  describe("hasBullishRsiCrossover", () => {
    it("returns true for valid bullish RSI crossover", () => {
      const rsiVals = [30, 31, 32, 33, 40, 41, 42];
      expect(VariableUtil.hasBullishRsiCrossover(rsiVals, 35, 4, 3)).toBe(true);
    });

    it("returns false if previous values are not below crossover", () => {
      const rsiVals = [36, 37, 38, 39, 40, 41, 42];
      expect(VariableUtil.hasBullishRsiCrossover(rsiVals, 35, 4, 3)).toBe(
        false,
      );
    });

    it("returns false if next values are not above crossover", () => {
      const rsiVals = [30, 31, 32, 33, 34, 35, 36];
      expect(VariableUtil.hasBullishRsiCrossover(rsiVals, 35, 4, 3)).toBe(
        false,
      );
    });
  });

  describe("hasBearishRsiCrossover", () => {
    it("returns true for valid bearish RSI crossover", () => {
      const rsiVals = [70, 69, 68, 67, 60, 59, 58];
      expect(VariableUtil.hasBearishRsiCrossover(rsiVals, 65, 4, 3)).toBe(true);
    });

    it("returns false if previous values are not above crossover", () => {
      const rsiVals = [64, 63, 62, 61, 60, 59, 58];
      expect(VariableUtil.hasBearishRsiCrossover(rsiVals, 65, 4, 3)).toBe(
        false,
      );
    });

    it("returns false if next values are not below crossover", () => {
      const rsiVals = [70, 69, 68, 67, 66, 65, 64];
      expect(VariableUtil.hasBearishRsiCrossover(rsiVals, 65, 4, 3)).toBe(
        false,
      );
    });
  });

  describe("hasBullishDivergence", () => {
    it("returns true for valid bullish divergence", () => {
      const priceVals = [100, 98, 99, 95, 96, 93, 94];
      const signalVals = [35, 33, 34, 31, 32, 37, 38];
      expect(VariableUtil.hasBullishDivergence(priceVals, signalVals)).toBe(
        true,
      );
    });

    it("returns false if not enough swing lows", () => {
      const priceVals = [100, 101, 102, 103];
      const signalVals = [40, 41, 42, 43];
      expect(VariableUtil.hasBullishDivergence(priceVals, signalVals)).toBe(
        false,
      );
    });

    it("returns false if divergence condition is not met", () => {
      const priceVals = [100, 98, 99, 95, 96, 93, 94];
      const signalVals = [35, 33, 34, 31, 32, 30, 29];
      expect(VariableUtil.hasBullishDivergence(priceVals, signalVals)).toBe(
        false,
      );
    });
  });

  describe("hasBearishDivergence", () => {
    it("returns true for valid bearish divergence", () => {
      const priceVals = [100, 102, 101, 104, 103, 105, 104];
      const signalVals = [70, 72, 71, 74, 73, 69, 68];
      expect(VariableUtil.hasBearishDivergence(priceVals, signalVals)).toBe(
        true,
      );
    });

    it("returns false if not enough swing highs", () => {
      const priceVals = [100, 101, 102, 103];
      const signalVals = [70, 71, 72, 73];
      expect(VariableUtil.hasBearishDivergence(priceVals, signalVals)).toBe(
        false,
      );
    });

    it("returns false if divergence condition is not met", () => {
      const priceVals = [100, 102, 101, 104, 103, 105, 104];
      const signalVals = [70, 72, 71, 74, 73, 75, 76];
      expect(VariableUtil.hasBearishDivergence(priceVals, signalVals)).toBe(
        false,
      );
    });
  });

  describe("hasBullishMacdCrossover", () => {
    it("returns true for valid bullish MACD crossover", () => {
      const macdVals = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
      const signalVals = [0.2, 0.3, 0.4, 0.3, 0.4, 0.5, 0.6];
      expect(
        VariableUtil.hasBullishMacdCrossover(macdVals, signalVals, 3, 4),
      ).toBe(true);
    });

    it("returns false if previous values are not below signal", () => {
      const macdVals = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const signalVals = [0.2, 0.3, 0.4, 0.3, 0.4, 0.5, 0.6];
      expect(
        VariableUtil.hasBullishMacdCrossover(macdVals, signalVals, 3, 4),
      ).toBe(false);
    });

    it("returns false if next values are not above signal", () => {
      const macdVals = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
      const signalVals = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      expect(
        VariableUtil.hasBullishMacdCrossover(macdVals, signalVals, 3, 4),
      ).toBe(false);
    });
  });

  describe("hasBearishMacdCrossover", () => {
    it("returns true for valid bearish MACD crossover", () => {
      const macdVals = [1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
      const signalVals = [1.0, 0.9, 0.8, 1.0, 0.9, 0.8, 0.7];
      expect(
        VariableUtil.hasBearishMacdCrossover(macdVals, signalVals, 3, 4),
      ).toBe(true);
    });

    it("returns false if previous values are not above signal", () => {
      const macdVals = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
      const signalVals = [1.0, 0.9, 0.8, 1.0, 0.9, 0.8, 0.7];
      expect(
        VariableUtil.hasBearishMacdCrossover(macdVals, signalVals, 3, 4),
      ).toBe(false);
    });

    it("returns false if next values are not below signal", () => {
      const macdVals = [1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
      const signalVals = [1.0, 0.9, 0.8, 1.0, 0.9, 0.8, 0.7];
      expect(
        VariableUtil.hasBearishMacdCrossover(macdVals, signalVals, 4, 3),
      ).toBe(false);
    });
  });
});
