import {
  VariablePatterns,
  VariableBuilders,
  VariableParsers,
  VariableMatchers,
} from "../../../shared/utilities/variable-patterns";

describe("variable-patterns", () => {
  describe("VariablePatterns", () => {
    describe("basic indicators", () => {
      it("should match percentChange pattern", () => {
        expect(VariablePatterns.percentChange.test("percentchange5")).toBe(
          true,
        );
        expect(VariablePatterns.percentChange.test("percentchange100")).toBe(
          true,
        );
        expect(VariablePatterns.percentChange.test("percentChange5")).toBe(
          false,
        ); // capital C
      });

      it("should match rsi pattern", () => {
        expect(VariablePatterns.rsi.test("rsi14")).toBe(true);
        expect(VariablePatterns.rsi.test("rsi7")).toBe(true);
        expect(VariablePatterns.rsi.test("RSI14")).toBe(false);
      });

      it("should match priceEma pattern", () => {
        expect(VariablePatterns.priceEma.test("priceEma12")).toBe(true);
        expect(VariablePatterns.priceEma.test("priceEma200")).toBe(true);
      });

      it("should match priceSma pattern", () => {
        expect(VariablePatterns.priceSma.test("priceSma20")).toBe(true);
        expect(VariablePatterns.priceSma.test("priceSma50")).toBe(true);
      });

      it("should match volumeSma pattern", () => {
        expect(VariablePatterns.volumeSma.test("volumeSma10")).toBe(true);
      });

      it("should match vwap pattern", () => {
        expect(VariablePatterns.vwap.test("vwap1")).toBe(true);
        expect(VariablePatterns.vwap.test("vwap5")).toBe(true);
      });
    });

    describe("bollinger bands", () => {
      it("should match bollingerBands pattern", () => {
        expect(
          VariablePatterns.bollingerBands.test("bollingerBands20Upper"),
        ).toBe(true);
        expect(
          VariablePatterns.bollingerBands.test("bollingerBands50Upper"),
        ).toBe(true);
        expect(
          VariablePatterns.bollingerBands.test("bollingerBands20Lower"),
        ).toBe(true);
        expect(
          VariablePatterns.bollingerBands.test("bollingerBands50Lower"),
        ).toBe(true);
        expect(VariablePatterns.bollingerBands.test("bollingerBands20")).toBe(
          false,
        );
      });
    });

    describe("MACD patterns", () => {
      it("should match macd pattern", () => {
        expect(VariablePatterns.macd.test("macdFast12Slow26")).toBe(true);
        expect(VariablePatterns.macd.test("macdFast8Slow21")).toBe(true);
        expect(VariablePatterns.macd.test("macd12")).toBe(false);
      });

      it("should match macdSignal pattern", () => {
        expect(
          VariablePatterns.macdSignal.test("macdFast12Slow26Signal9"),
        ).toBe(true);
      });

      it("should match macdCrossover pattern with Bullish/Bearish", () => {
        expect(
          VariablePatterns.macdCrossover.test(
            "macdFast12Slow26Signal9BullishCrossoverPeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
        expect(
          VariablePatterns.macdCrossover.test(
            "macdFast12Slow26Signal9BearishCrossoverPeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
      });

      it("should match macdDivergence pattern", () => {
        expect(
          VariablePatterns.macdDivergence.test(
            "macdFast12Slow26BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
        expect(
          VariablePatterns.macdDivergence.test(
            "macdFast12Slow26BearishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
      });
    });

    describe("RSI patterns", () => {
      it("should match rsiCrossover pattern", () => {
        expect(
          VariablePatterns.rsiCrossover.test(
            "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
        expect(
          VariablePatterns.rsiCrossover.test(
            "rsi14BearishCrossover70PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
      });

      it("should match rsiDivergence pattern", () => {
        expect(
          VariablePatterns.rsiDivergence.test(
            "rsi14BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
        expect(
          VariablePatterns.rsiDivergence.test(
            "rsi14BearishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
          ),
        ).toBe(true);
      });
    });

    describe("MTSI patterns", () => {
      it("should match mtsiVwap pattern", () => {
        expect(VariablePatterns.mtsiVwap.test("mtsiNumeratorVwap1")).toBe(true);
        expect(VariablePatterns.mtsiVwap.test("mtsiDenominatorVwap1")).toBe(
          true,
        );
        expect(VariablePatterns.mtsiVwap.test("mtsiVwap1")).toBe(false);
      });

      it("should match mtsiVwapEma1 pattern", () => {
        expect(
          VariablePatterns.mtsiVwapEma1.test("mtsiNumeratorVwap1Ema5"),
        ).toBe(true);
        expect(
          VariablePatterns.mtsiVwapEma1.test("mtsiDenominatorVwap1Ema5"),
        ).toBe(true);
      });

      it("should match mtsiVwapEma2 pattern", () => {
        expect(
          VariablePatterns.mtsiVwapEma2.test("mtsiNumeratorVwap1Ema5Ema3"),
        ).toBe(true);
        expect(
          VariablePatterns.mtsiVwapEma2.test("mtsiDenominatorVwap1Ema5Ema3"),
        ).toBe(true);
      });

      it("should match mtsi pattern", () => {
        expect(VariablePatterns.mtsi.test("mtsiM5N3Vwap1")).toBe(true);
        expect(VariablePatterns.mtsi.test("mtsiM10N20Vwap1")).toBe(true);
      });
    });

    describe("TSI patterns", () => {
      it("should match tsiEma1 pattern", () => {
        expect(VariablePatterns.tsiEma1.test("tsiNumeratorEma5")).toBe(true);
        expect(VariablePatterns.tsiEma1.test("tsiDenominatorEma5")).toBe(true);
      });

      it("should match tsiEma2 pattern", () => {
        expect(VariablePatterns.tsiEma2.test("tsiNumeratorEma5Ema3")).toBe(
          true,
        );
        expect(VariablePatterns.tsiEma2.test("tsiDenominatorEma5Ema3")).toBe(
          true,
        );
      });

      it("should match tsi pattern", () => {
        expect(VariablePatterns.tsi.test("tsiM5N3")).toBe(true);
      });
    });
  });

  describe("VariableBuilders", () => {
    it("should build basic indicator names", () => {
      expect(VariableBuilders.percentChange(5)).toBe("percentchange5");
      expect(VariableBuilders.rsi(14)).toBe("rsi14");
      expect(VariableBuilders.priceEma(12)).toBe("priceEma12");
      expect(VariableBuilders.priceSma(20)).toBe("priceSma20");
      expect(VariableBuilders.volumeSma(10)).toBe("volumeSma10");
      expect(VariableBuilders.vwap(1)).toBe("vwap1");
    });

    it("should build bollinger bands names", () => {
      expect(VariableBuilders.bollingerBandsUpper(20)).toBe(
        "bollingerBands20Upper",
      );
      expect(VariableBuilders.bollingerBandsLower(20)).toBe(
        "bollingerBands20Lower",
      );
    });

    it("should build MACD names", () => {
      expect(VariableBuilders.macd(12, 26)).toBe("macdFast12Slow26");
      expect(VariableBuilders.macdSignal(12, 26, 9)).toBe(
        "macdFast12Slow26Signal9",
      );
    });

    it("should build MACD crossover with bullish/bearish", () => {
      expect(VariableBuilders.macdCrossover(12, 26, 9, 0, 2, 3, true)).toBe(
        "macdFast12Slow26Signal9BullishCrossover0PeriodsBefore2PeriodsAfter3",
      );
      expect(VariableBuilders.macdCrossover(12, 26, 9, 0, 2, 3, false)).toBe(
        "macdFast12Slow26Signal9BearishCrossover0PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should build MACD divergence with bullish/bearish", () => {
      expect(VariableBuilders.macdDivergence(12, 26, 10, 2, 3, true)).toBe(
        "macdFast12Slow26BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
      expect(VariableBuilders.macdDivergence(12, 26, 10, 2, 3, false)).toBe(
        "macdFast12Slow26BearishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should build RSI crossover with bullish/bearish", () => {
      expect(VariableBuilders.rsiCrossover(14, 30, 2, 3, true)).toBe(
        "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
      );
      expect(VariableBuilders.rsiCrossover(14, 70, 2, 3, false)).toBe(
        "rsi14BearishCrossover70PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should build RSI divergence with bullish/bearish", () => {
      expect(VariableBuilders.rsiDivergence(14, 10, 2, 3, true)).toBe(
        "rsi14BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
      expect(VariableBuilders.rsiDivergence(14, 10, 2, 3, false)).toBe(
        "rsi14BearishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should build MTSI names with numerator/denominator", () => {
      expect(VariableBuilders.mtsiVwap(1, true)).toBe("mtsiNumeratorVwap1");
      expect(VariableBuilders.mtsiVwap(1, false)).toBe("mtsiDenominatorVwap1");

      expect(VariableBuilders.mtsiVwapEma(1, 5, true)).toBe(
        "mtsiNumeratorVwap1Ema5",
      );
      expect(VariableBuilders.mtsiVwapEma(1, 5, false)).toBe(
        "mtsiDenominatorVwap1Ema5",
      );

      expect(VariableBuilders.mtsiVwapEma2(1, 5, 3, true)).toBe(
        "mtsiNumeratorVwap1Ema5Ema3",
      );
      expect(VariableBuilders.mtsiVwapEma2(1, 5, 3, false)).toBe(
        "mtsiDenominatorVwap1Ema5Ema3",
      );

      expect(VariableBuilders.mtsi(5, 3, 1)).toBe("mtsiM5N3Vwap1");
    });

    it("should build TSI names with numerator/denominator", () => {
      expect(VariableBuilders.tsiEma(5, true)).toBe("tsiNumeratorEma5");
      expect(VariableBuilders.tsiEma(5, false)).toBe("tsiDenominatorEma5");

      expect(VariableBuilders.tsiEma2(5, 3, true)).toBe("tsiNumeratorEma5Ema3");
      expect(VariableBuilders.tsiEma2(5, 3, false)).toBe(
        "tsiDenominatorEma5Ema3",
      );

      expect(VariableBuilders.tsi(5, 3)).toBe("tsiM5N3");
    });

    it("should build percentile names", () => {
      expect(VariableBuilders.percentileRank(90, 5)).toBe(
        "percentileRank90Period5",
      );
      expect(VariableBuilders.pricePercentChangePercentile(5, 10)).toBe(
        "pricePercentChange5PercentileSessions10",
      );
    });
  });

  describe("VariableParsers", () => {
    it("should extract period from simple variable names", () => {
      expect(VariableParsers.extractPeriod("rsi14")).toBe(14);
      expect(VariableParsers.extractPeriod("percentchange5")).toBe(5);
      expect(VariableParsers.extractPeriod("priceEma200")).toBe(200);
      expect(VariableParsers.extractPeriod("invalid")).toBe(0);
    });

    it("should parse MACD variables", () => {
      const result = VariableParsers.parseMacd("macdFast12Slow26");
      expect(result).toEqual({ fast: 12, slow: 26 });

      expect(VariableParsers.parseMacd("invalid")).toBeNull();
    });

    it("should parse MACD signal variables", () => {
      const result = VariableParsers.parseMacdSignal("macdFast12Slow26Signal9");
      expect(result).toEqual({ fast: 12, slow: 26, signal: 9 });

      expect(VariableParsers.parseMacdSignal("invalid")).toBeNull();
    });

    it("should parse price percent change percentile variables", () => {
      const result = VariableParsers.parsePricePercentChangePercentile(
        "pricePercentChange5PercentileSessions20",
      );
      expect(result).toEqual({ period: 5, sessions: 20 });

      // backward-compatible parse
      const legacyResult = VariableParsers.parsePricePercentChangePercentile(
        "pricePercentChange5Percentile20",
      );
      expect(legacyResult).toEqual({ period: 5, sessions: 20 });
    });

    it("should parse RSI crossover variables", () => {
      const bullish = VariableParsers.parseRsiCrossover(
        "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
      );
      expect(bullish).toEqual({
        period: 14,
        bullish: true,
        level: 30,
        before: 2,
        after: 3,
      });

      const bearish = VariableParsers.parseRsiCrossover(
        "rsi14BearishCrossover70PeriodsBefore2PeriodsAfter3",
      );
      expect(bearish).toEqual({
        period: 14,
        bullish: false,
        level: 70,
        before: 2,
        after: 3,
      });

      expect(VariableParsers.parseRsiCrossover("invalid")).toBeNull();
    });

    it("should parse MTSI vwap period", () => {
      expect(
        VariableParsers.parseMtsiVwapPeriod("mtsiNumeratorVwap1Ema5"),
      ).toBe(1);
      expect(VariableParsers.parseMtsiVwapPeriod("mtsiM5N3Vwap10")).toBe(10);
      expect(VariableParsers.parseMtsiVwapPeriod("invalid")).toBe(0);
    });

    it("should parse MTSI variables", () => {
      const result = VariableParsers.parseMtsi("mtsiM10N20Vwap1");
      expect(result).toEqual({ m: 10, n: 20, vwapPeriod: 1 });

      expect(VariableParsers.parseMtsi("invalid")).toBeNull();
    });
  });

  describe("VariableMatchers", () => {
    it("should match basic indicators", () => {
      expect(VariableMatchers.isPercentChange("percentchange5")).toBe(true);
      expect(VariableMatchers.isRsi("rsi14")).toBe(true);
      expect(VariableMatchers.isPriceEma("priceEma12")).toBe(true);
      expect(VariableMatchers.isPriceSma("priceSma20")).toBe(true);
      expect(VariableMatchers.isVolumeSma("volumeSma10")).toBe(true);
    });

    it("should match bollinger bands", () => {
      expect(VariableMatchers.isBollingerBands("bollingerBands20Upper")).toBe(
        true,
      );
      expect(VariableMatchers.isBollingerBands("bollingerBands20Lower")).toBe(
        true,
      );
      expect(VariableMatchers.isBollingerBands("bollingerBands20")).toBe(false);
    });

    it("should match MACD patterns", () => {
      expect(VariableMatchers.isMacd("macdFast12Slow26")).toBe(true);
      expect(VariableMatchers.isMacdSignal("macdFast12Slow26Signal9")).toBe(
        true,
      );
      expect(
        VariableMatchers.isMacdCrossover(
          "macdFast12Slow26Signal9BullishCrossoverPeriodsBefore2PeriodsAfter3",
        ),
      ).toBe(true);
      expect(
        VariableMatchers.isMacdDivergence(
          "macdFast12Slow26BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
        ),
      ).toBe(true);
    });

    it("should match RSI patterns", () => {
      expect(
        VariableMatchers.isRsiCrossover(
          "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
        ),
      ).toBe(true);
      expect(
        VariableMatchers.isRsiDivergence(
          "rsi14BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
        ),
      ).toBe(true);
    });

    it("should match MTSI patterns", () => {
      expect(VariableMatchers.isMtsi("mtsiM5N3Vwap1")).toBe(true);
      expect(VariableMatchers.isMtsiVwap("mtsiNumeratorVwap1")).toBe(true);
      expect(VariableMatchers.isMtsiVwap("mtsiDenominatorVwap1")).toBe(true);
    });

    it("should match TSI patterns", () => {
      expect(VariableMatchers.isTsi("tsiM5N3")).toBe(true);
      expect(VariableMatchers.isTsiEma("tsiNumeratorEma5")).toBe(true);
      expect(VariableMatchers.isTsiEma("tsiNumeratorEma5Ema3")).toBe(true);
    });

    it("should not match invalid patterns", () => {
      expect(VariableMatchers.isRsi("invalidRsi")).toBe(false);
      expect(VariableMatchers.isMacd("invalid")).toBe(false);
      expect(VariableMatchers.isMtsi("invalid")).toBe(false);
    });
  });
});
