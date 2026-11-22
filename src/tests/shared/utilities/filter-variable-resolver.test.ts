import {
  resolveFilterVariables,
  FilterTypeGuards,
} from "../../../shared/utilities/filter-variable-resolver";
import { IFilter as OriginalIFilter } from "../../../types/strategy-types";
import * as variablePatterns from "../../../shared/utilities/variable-patterns";
import * as strategyUtil from "../../../shared/utilities/strategy-util";

// Extend IFilter for test purposes to allow extra properties
type IFilter = OriginalIFilter & {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  periodsBefore?: number;
  periodsAfter?: number;
  emaPeriod1?: number;
  emaPeriod2?: number;
  percentile?: number;
  timeAgo?: string;
  compareVar?: string;
  compareTimeAgo?: string;
  bullish?: boolean;
  vwapPeriod?: number;
  crossoverLevel?: number;
  period?: number;
  lookback?: number;
};

jest.mock("../../../shared/utilities/variable-patterns");
jest.mock("../../../shared/utilities/strategy-util");

describe("filter-variable-resolver", () => {
  describe("FilterTypeGuards", () => {
    it("should identify MACD filter", () => {
      const filter: IFilter = {
        varName: "macd",
        operator: ">",
        compareVal: "0",
        fastPeriod: 12,
        slowPeriod: 26,
      };
      expect(FilterTypeGuards.isMacdFilter(filter)).toBe(true);
    });

    it("should identify MACD crossover filter", () => {
      const filter: IFilter = {
        varName: "macdCrossover",
        operator: "=",
        compareVal: "1",
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        periodsBefore: 2,
        periodsAfter: 3,
        crossoverLevel: 0,
        bullish: true,
      };
      expect(FilterTypeGuards.isMacdCrossOverFilter(filter)).toBe(true);
    });

    it("should identify MTSI filter", () => {
      const filter: IFilter = {
        varName: "mtsi",
        operator: ">",
        compareVal: "0",
        emaPeriod1: 10,
        emaPeriod2: 20,
        vwapPeriod: 1,
      };
      expect(FilterTypeGuards.isMtsiFilter(filter)).toBe(true);
    });

    it("should identify TSI filter", () => {
      const filter: IFilter = {
        varName: "tsi",
        operator: ">",
        compareVal: "0",
        emaPeriod1: 5,
        emaPeriod2: 8,
      };
      expect(FilterTypeGuards.isTsiFilter(filter)).toBe(true);
    });

    it("should identify RSI crossover filter", () => {
      const filter: IFilter = {
        varName: "rsiCrossover",
        operator: ">",
        compareVal: "1",
        period: 14,
        bullish: true,
        crossoverLevel: 30,
        periodsBefore: 2,
        periodsAfter: 3,
      };
      expect(FilterTypeGuards.isRsiCrossoverFilter(filter)).toBe(true);
    });

    it("should identify RSI divergence filter", () => {
      const filter: IFilter = {
        varName: "rsiDivergence",
        operator: ">",
        compareVal: "1",
        period: 14,
        bullish: true,
        lookback: 10,
        periodsBefore: 2,
        periodsAfter: 3,
      };
      expect(FilterTypeGuards.isRsiDivergenceFilter(filter)).toBe(true);
    });

    it("should identify MACD divergence filter", () => {
      const filter: IFilter = {
        varName: "macdDivergence",
        operator: ">",
        compareVal: "1",
        fastPeriod: 12,
        slowPeriod: 26,
        bullish: true,
        lookback: 10,
        periodsBefore: 2,
        periodsAfter: 3,
      };
      expect(FilterTypeGuards.isMacdDivergenceFilter(filter)).toBe(true);
    });

    it("should identify percentile rank filter", () => {
      const filter: IFilter = {
        varName: "percentileRank",
        operator: ">",
        compareVal: "0",
        percentile: 90,
        timeAgo: "5",
      };
      expect(FilterTypeGuards.isPercentileRankFilter(filter)).toBe(true);
    });

    it("should identify price percent change percentile filter", () => {
      const filter: IFilter = {
        varName: "pricePercentChangePercentile",
        operator: ">",
        compareVal: "0",
        timeAgo: "5",
        numberOfSessions: "10",
      };
      expect(
        FilterTypeGuards.isPricePercentChangePercentileFilter(filter),
      ).toBe(true);
    });
  });

  describe("resolveFilterVariables", () => {
    beforeEach(() => {
      // Mock VariableBuilders
      jest
        .spyOn(variablePatterns.VariableBuilders, "rsi")
        .mockImplementation((period) => `rsi${period}`);
      jest
        .spyOn(variablePatterns.VariableBuilders, "rsiCrossover")
        .mockImplementation(
          (period, level, before, after, bullish) =>
            `rsi${period}${bullish ? "Bullish" : "Bearish"}Crossover${level}PeriodsBefore${before}PeriodsAfter${after}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "priceEma")
        .mockImplementation((period) => `priceEma${period}`);
      jest
        .spyOn(variablePatterns.VariableBuilders, "macd")
        .mockImplementation((fast, slow) => `macdFast${fast}Slow${slow}`);
      jest
        .spyOn(variablePatterns.VariableBuilders, "macdSignal")
        .mockImplementation(
          (fast, slow, signal) => `macdFast${fast}Slow${slow}Signal${signal}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "macdCrossover")
        .mockImplementation(
          (fast, slow, signal, level, before, after, bullish) =>
            `macdFast${fast}Slow${slow}Signal${signal}${bullish ? "Bullish" : "Bearish"}Crossover${level}PeriodsBefore${before}PeriodsAfter${after}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "macdDivergence")
        .mockImplementation(
          (fast, slow, lookback, before, after, bullish) =>
            `macdFast${fast}Slow${slow}${bullish ? "Bullish" : "Bearish"}DivergenceLookback${lookback}PeriodsBefore${before}PeriodsAfter${after}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "rsiDivergence")
        .mockImplementation(
          (period, lookback, before, after, bullish) =>
            `rsi${period}${bullish ? "Bullish" : "Bearish"}DivergenceLookback${lookback}PeriodsBefore${before}PeriodsAfter${after}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "mtsiVwap")
        .mockImplementation(
          (vwapPeriod, isNumerator) =>
            `mtsi${isNumerator ? "Numerator" : "Denominator"}Vwap${vwapPeriod}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "mtsiVwapEma")
        .mockImplementation(
          (vwapPeriod, emaPeriod, isNumerator) =>
            `mtsi${isNumerator ? "Numerator" : "Denominator"}Vwap${vwapPeriod}Ema${emaPeriod}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "mtsiVwapEma2")
        .mockImplementation(
          (vwapPeriod, ema1, ema2, isNumerator) =>
            `mtsi${isNumerator ? "Numerator" : "Denominator"}Vwap${vwapPeriod}Ema${ema1}Ema${ema2}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "mtsi")
        .mockImplementation(
          (m, n, vwapPeriod) => `mtsiM${m}N${n}Vwap${vwapPeriod}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "vwap")
        .mockImplementation((period) => `vwap${period}`);
      jest
        .spyOn(variablePatterns.VariableBuilders, "tsiEma")
        .mockImplementation(
          (emaPeriod, isNumerator) =>
            `tsi${isNumerator ? "Numerator" : "Denominator"}Ema${emaPeriod}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "tsiEma2")
        .mockImplementation(
          (ema1, ema2, isNumerator) =>
            `tsi${isNumerator ? "Numerator" : "Denominator"}Ema${ema1}Ema${ema2}`,
        );
      jest
        .spyOn(variablePatterns.VariableBuilders, "tsi")
        .mockImplementation((m, n) => `tsiM${m}N${n}`);
      jest
        .spyOn(variablePatterns.VariableBuilders, "pricePercentChangePercentile")
        .mockImplementation(
          (period, sessions) =>
            `pricePercentChange${period}PercentileSessions${sessions}`,
        );

      // Mock StrategyUtil
      jest
        .spyOn(strategyUtil.StrategyUtil, "convertToVariableName")
        .mockImplementation(
          (filter) => `${filter.varName}${filter.timeAgo || ""}`,
        );
      jest
        .spyOn(strategyUtil.StrategyUtil, "convertToCompareVarName")
        .mockImplementation(
          (filter) => `${filter.compareVar}${filter.compareVarTimeAgo || ""}`,
        );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should resolve RSI crossover filter variables", () => {
      const filter: IFilter = {
        varName: "rsiCrossover",
        operator: ">",
        compareVal: "1",
        period: 14,
        bullish: true,
        crossoverLevel: 30,
        periodsBefore: 2,
        periodsAfter: 3,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.rsi).toHaveBeenCalledWith(14);
      expect(
        variablePatterns.VariableBuilders.rsiCrossover,
      ).toHaveBeenCalledWith(14, 30, 2, 3, true);
      expect(variables).toContain("rsi14");
      expect(variables).toContain(
        "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should resolve MACD crossover filter variables", () => {
      const filter: IFilter = {
        varName: "macdCrossover",
        operator: "=",
        compareVal: "1",
        bullish: true,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        crossoverLevel: 0,
        periodsBefore: 2,
        periodsAfter: 3,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        12,
      );
      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        26,
      );
      expect(variablePatterns.VariableBuilders.macd).toHaveBeenCalledWith(
        12,
        26,
      );
      expect(variablePatterns.VariableBuilders.macdSignal).toHaveBeenCalledWith(
        12,
        26,
        9,
      );
      expect(
        variablePatterns.VariableBuilders.macdCrossover,
      ).toHaveBeenCalledWith(12, 26, 9, 0, 2, 3, true);
      expect(variables).toContain("priceEma12");
      expect(variables).toContain("priceEma26");
      expect(variables).toContain("macdFast12Slow26");
      expect(variables).toContain("macdFast12Slow26Signal9");
      expect(variables).toContain(
        "macdFast12Slow26Signal9BullishCrossover0PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should resolve MACD filter variables", () => {
      const filter: IFilter = {
        varName: "macd",
        operator: ">",
        compareVal: "0",
        fastPeriod: 12,
        slowPeriod: 26,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        12,
      );
      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        26,
      );
      expect(variablePatterns.VariableBuilders.macd).toHaveBeenCalledWith(
        12,
        26,
      );
      expect(variables).toContain("priceEma12");
      expect(variables).toContain("priceEma26");
      expect(variables).toContain("macdFast12Slow26");
    });

    it("should resolve MTSI filter variables", () => {
      const filter: IFilter = {
        varName: "mtsi",
        operator: ">",
        compareVal: "0",
        emaPeriod1: 10,
        emaPeriod2: 20,
        vwapPeriod: 1,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.mtsiVwap).toHaveBeenCalledWith(
        1,
        true,
      );
      expect(variablePatterns.VariableBuilders.mtsiVwap).toHaveBeenCalledWith(
        1,
        false,
      );
      expect(
        variablePatterns.VariableBuilders.mtsiVwapEma,
      ).toHaveBeenCalledWith(1, 10, true);
      expect(
        variablePatterns.VariableBuilders.mtsiVwapEma2,
      ).toHaveBeenCalledWith(1, 10, 20, true);
      expect(
        variablePatterns.VariableBuilders.mtsiVwapEma,
      ).toHaveBeenCalledWith(1, 10, false);
      expect(
        variablePatterns.VariableBuilders.mtsiVwapEma2,
      ).toHaveBeenCalledWith(1, 10, 20, false);
      expect(variablePatterns.VariableBuilders.mtsi).toHaveBeenCalledWith(
        10,
        20,
        1,
      );
      expect(variablePatterns.VariableBuilders.vwap).toHaveBeenCalledWith(1);
      expect(variables).toContain("mtsiNumeratorVwap1");
      expect(variables).toContain("mtsiDenominatorVwap1");
      expect(variables).toContain("mtsiNumeratorVwap1Ema10");
      expect(variables).toContain("mtsiNumeratorVwap1Ema10Ema20");
      expect(variables).toContain("mtsiDenominatorVwap1Ema10");
      expect(variables).toContain("mtsiDenominatorVwap1Ema10Ema20");
      expect(variables).toContain("mtsiM10N20Vwap1");
      expect(variables).toContain("vwap1");
    });

    it("should resolve TSI filter variables", () => {
      const filter: IFilter = {
        varName: "tsi",
        operator: ">",
        compareVal: "0",
        emaPeriod1: 5,
        emaPeriod2: 8,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.tsiEma).toHaveBeenCalledWith(
        5,
        true,
      );
      expect(variablePatterns.VariableBuilders.tsiEma2).toHaveBeenCalledWith(
        5,
        8,
        true,
      );
      expect(variablePatterns.VariableBuilders.tsiEma).toHaveBeenCalledWith(
        5,
        false,
      );
      expect(variablePatterns.VariableBuilders.tsiEma2).toHaveBeenCalledWith(
        5,
        8,
        false,
      );
      expect(variablePatterns.VariableBuilders.tsi).toHaveBeenCalledWith(5, 8);
      expect(variables).toContain("tsiNumeratorEma5");
      expect(variables).toContain("tsiNumeratorEma5Ema8");
      expect(variables).toContain("tsiDenominatorEma5");
      expect(variables).toContain("tsiDenominatorEma5Ema8");
      expect(variables).toContain("tsiM5N8");
    });

    it("should resolve percentile rank filter variables", () => {
      const filter: IFilter = {
        varName: "percentileRank",
        operator: ">",
        compareVal: "0",
        percentile: 90,
        timeAgo: "5",
      };

      const variables = resolveFilterVariables(filter);

      expect(variables).toContain("percentileRank90Period5");
    });

    it("should resolve RSI divergence filter variables", () => {
      const filter: IFilter = {
        varName: "rsiDivergence",
        operator: ">",
        compareVal: "1",
        period: 14,
        bullish: true,
        lookback: 10,
        periodsBefore: 2,
        periodsAfter: 3,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.rsi).toHaveBeenCalledWith(14);
      expect(
        variablePatterns.VariableBuilders.rsiDivergence,
      ).toHaveBeenCalledWith(14, 10, 2, 3, true);
      expect(variables).toContain("rsi14");
      expect(variables).toContain(
        "rsi14BullishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should resolve MACD divergence filter variables", () => {
      const filter: IFilter = {
        varName: "macdDivergence",
        operator: ">",
        compareVal: "1",
        fastPeriod: 12,
        slowPeriod: 26,
        bullish: false,
        lookback: 10,
        periodsBefore: 2,
        periodsAfter: 3,
      };

      const variables = resolveFilterVariables(filter);

      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        12,
      );
      expect(variablePatterns.VariableBuilders.priceEma).toHaveBeenCalledWith(
        26,
      );
      expect(variablePatterns.VariableBuilders.macd).toHaveBeenCalledWith(
        12,
        26,
      );
      expect(
        variablePatterns.VariableBuilders.macdDivergence,
      ).toHaveBeenCalledWith(12, 26, 10, 2, 3, false);
      expect(variables).toContain("priceEma12");
      expect(variables).toContain("priceEma26");
      expect(variables).toContain("macdFast12Slow26");
      expect(variables).toContain(
        "macdFast12Slow26BearishDivergenceLookback10PeriodsBefore2PeriodsAfter3",
      );
    });

    it("should resolve price percent change percentile filter variables", () => {
      const filter: IFilter = {
        varName: "pricePercentChangePercentile",
        operator: ">",
        compareVal: "0",
        timeAgo: "5",
        numberOfSessions: "10",
      };

      const variables = resolveFilterVariables(filter);

      expect(variables).toContain("pricePercentChange5PercentileSessions10");
    });

    it("should resolve default filter with compareVar", () => {
      const filter: IFilter = {
        varName: "priceEma",
        operator: ">",
        compareVal: "10",
        timeAgo: "5",
        compareVar: "priceSma",
        compareTimeAgo: "10",
      };

      resolveFilterVariables(filter);

      expect(
        strategyUtil.StrategyUtil.convertToVariableName,
      ).toHaveBeenCalledWith(filter);
      expect(
        strategyUtil.StrategyUtil.convertToCompareVarName,
      ).toHaveBeenCalledWith(filter);
    });

    it("should resolve percent change filter", () => {
      const filter: IFilter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
        timeAgo: "60",
      };

      const variables = resolveFilterVariables(filter);

      expect(
        strategyUtil.StrategyUtil.convertToVariableName,
      ).toHaveBeenCalledWith(filter);
      expect(variables).toContain("percentchange60");
    });

    it("should default bullish to true when undefined in matched filter", () => {
      const filter: IFilter = {
        varName: "rsiCrossover",
        operator: ">",
        compareVal: "1",
        period: 14,
        crossoverLevel: 30,
        periodsBefore: 2,
        periodsAfter: 3,
        bullish: undefined,
      };

      const variables = resolveFilterVariables(filter);

      // When bullish is undefined, it defaults to true (via ?? true)
      expect(variablePatterns.VariableBuilders.rsi).toHaveBeenCalledWith(14);
      expect(
        variablePatterns.VariableBuilders.rsiCrossover,
      ).toHaveBeenCalledWith(14, 30, 2, 3, true);
      expect(variables).toContain("rsi14");
      expect(variables).toContain(
        "rsi14BullishCrossover30PeriodsBefore2PeriodsAfter3",
      );
    });
  });
});
