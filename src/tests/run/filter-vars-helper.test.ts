import { PeriodType, MemoryType } from "../../shared/constants";
import { FilterVarsHelper } from "../../run/filter-vars-helper";
import {
  IAllFilterData,
  IStockScreenerJob,
  IAllStockNames,
  IAllMemory,
  IStockData,
} from "../../types/data-processing-types";
import {
  initFilterData,
  initMemories,
  initStockNames,
} from "../../shared/utilities/run-util";
import { VariableUtil } from "../../shared/utilities/variable-util";
import {
  VariableMatchers,
  VariableParsers,
} from "../../shared/utilities/variable-patterns";

jest.mock("../../shared/utilities/stock-trade");
jest.mock("../../shared/utilities/variable-util", () => ({
  VariableUtil: {
    isMACDFilter: jest.fn(),
    hasBullishDivergence: jest.fn(() => false),
    hasBearishDivergence: jest.fn(() => false),
    hasBullishRsiCrossover: jest.fn(() => false),
    hasBearishRsiCrossover: jest.fn(() => false),
    hasBullishMacdCrossover: jest.fn(() => false),
    hasBearishMacdCrossover: jest.fn(() => false),
  },
}));

jest.mock("../../shared/utilities/variable-calculations", () => ({
  calculatePercentChange: jest.fn(() => 0),
  calculateSma: jest.fn(() => 2),
  calculateEma: jest.fn(() => 3),
  calculateRsi: jest.fn(() => 4),
  calculateBollingerBand: jest.fn(() => 5),
  calculateMacd: jest.fn(() => 6),
  calculateMtsiNumerator: jest.fn(() => 0.1),
  calculateMtsiDenominator: jest.fn(() => 0.2),
  calculateMtsiEma: jest.fn(() => 0.3),
  calculateMtsi: jest.fn(() => 0.4),
  calculatePercentileRank: jest.fn(() => 50),
}));

jest.mock("../../shared/utilities/variable-patterns", () => ({
  VariableMatchers: {
    isPercentChange: jest.fn(() => false),
    isVolumeSma: jest.fn(() => false),
    isVolumePercentChange: jest.fn(() => false),
    isPriceSma: jest.fn(() => false),
    isPriceEma: jest.fn(() => false),
    isRsi: jest.fn(() => false),
    isBollingerBands: jest.fn(() => false),
    isBollingerBandsUpper: jest.fn(() => false),
    isBollingerBandsLower: jest.fn(() => false),
    isVwap: jest.fn(() => false),
    isVwapNumeratorCumulative: jest.fn(() => false),
    isVwapDenominatorCumulative: jest.fn(() => false),
    isMtsiVwap: jest.fn(() => false),
    isMtsi: jest.fn(() => false),
    isRsiDivergence: jest.fn(() => false),
    isRsiCrossover: jest.fn(() => false),
    isMacd: jest.fn(() => false),
    isMacdSignal: jest.fn(() => false),
    isMacdDivergence: jest.fn(() => false),
    isMacdCrossover: jest.fn(() => false),
    isPricePercentChangePercentile: jest.fn(() => false),
  },
  VariableParsers: {
    extractPeriod: jest.fn(() => 0),
    parseMtsiVwapPeriod: jest.fn(() => 0),
    parseRsiCrossover: jest.fn(() => null),
    parseRsiDivergence: jest.fn(() => null),
    parseMacd: jest.fn(() => null),
    parseMacdSignal: jest.fn(() => null),
    parseMacdDivergence: jest.fn(() => null),
    parseMtsi: jest.fn(() => null),
    parsePricePercentChangePercentile: jest.fn(() => null),
  },
  VariablePatterns: {
    vwap: /^vwap(\d+)$/,
    mtsiVwap: /^mtsi(Numerator|Denominator)Vwap(\d+)$/,
    mtsiVwapEma1: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)$/,
    mtsiVwapEma2: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)Ema(\d+)$/,
    macdCrossover:
      /^macdFast(\d+)Slow(\d+)Signal(\d+)(Bullish|Bearish)CrossoverPeriodsBefore(\d+)PeriodsAfter(\d+)$/,
  },
  VariableTokens: {
    numerator: "Numerator",
    denominator: "Denominator",
    bullish: "Bullish",
    bearish: "Bearish",
  },
  VariableBuilders: {
    priceEma: jest.fn(() => "priceEma12"),
    priceSma: jest.fn(() => "priceSma1"),
    volumeSma: jest.fn(() => "volumeSma1"),
    rsi: jest.fn(() => "rsi14"),
    vwap: jest.fn(() => "vwap1"),
    vwapNumeratorCumulative: jest.fn(() => "vwapNumeratorCumulative"),
    vwapDenominatorCumulative: jest.fn(() => "vwapDenominatorCumulative"),
    mtsiVwap: jest.fn(() => "mtsiNumeratorVwap1"),
    mtsiVwapEma: jest.fn(() => "mtsiNumeratorVwap1Ema2"),
    mtsiVwapEma2: jest.fn(() => "mtsiNumeratorVwap1Ema2Ema2"),
    macd: jest.fn(() => "macdFast12Slow26"),
    macdSignal: jest.fn(() => "macdFast12Slow26Signal9"),
    percentChange: jest.fn((period: number) => `percentchange${period}`),
    timeKey: jest.fn(() => "time"),
  },
}));

describe("FilterVarsHelper", () => {
  let filterVarsHelper: FilterVarsHelper;

  beforeEach(() => {
    filterVarsHelper = new FilterVarsHelper();
  });

  describe("initVars", () => {
    it("should initialize variables", () => {
      const mockGlobalVars: IAllFilterData = initFilterData();
      const mockJobs: IStockScreenerJob[] = [
        {
          getAdditionalPeriods: jest.fn().mockReturnValue([]),
          getAllVariables: jest.fn().mockReturnValue([]),
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest.fn().mockReturnValue({}),
          getCrossPeriodVars: jest.fn().mockReturnValue({}),
          getName: jest.fn().mockReturnValue("test name"),
        } as unknown as IStockScreenerJob,
      ];
      const mockSymbolsMatrix: IAllStockNames = initStockNames();
      mockSymbolsMatrix[PeriodType.DAY] = ["AAPL", "GOOGL"];
      const result = filterVarsHelper.initVars(
        mockGlobalVars,
        mockJobs,
        mockSymbolsMatrix,
      );
      expect(result).toEqual(mockGlobalVars);
    });

    it("should throw when percentile sessions exceed max for period during initialization", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;
      const mockedParsers = VariableParsers as jest.Mocked<
        typeof VariableParsers
      >;

      mockedMatchers.isPricePercentChangePercentile.mockImplementation(
        (name: string) => name === "pricePercentChangePercentileBad",
      );
      mockedParsers.parsePricePercentChangePercentile.mockReturnValue({
        period: 5,
        sessions: 999,
      });

      const mockGlobalVars: IAllFilterData = initFilterData();
      const mockJobs: IStockScreenerJob[] = [
        {
          getAdditionalPeriods: jest.fn().mockReturnValue([]),
          getAllVariables: jest
            .fn()
            .mockReturnValue(["pricePercentChangePercentileBad"]),
          getPeriod: jest.fn().mockReturnValue(PeriodType.MINUTE),
          getVars: jest.fn().mockReturnValue({}),
          getCrossPeriodVars: jest.fn().mockReturnValue({}),
          getName: jest.fn().mockReturnValue("test name"),
        } as unknown as IStockScreenerJob,
      ];
      const mockSymbolsMatrix: IAllStockNames = initStockNames();
      mockSymbolsMatrix[PeriodType.MINUTE] = ["AAPL"];

      expect(() =>
        filterVarsHelper.initVars(mockGlobalVars, mockJobs, mockSymbolsMatrix),
      ).toThrow("exceeds max");
    });
  });

  describe("transferVars", () => {
    it("should transfer variables", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;
      const mockedParsers = VariableParsers as jest.Mocked<
        typeof VariableParsers
      >;

      mockedMatchers.isPriceEma.mockImplementation(
        (key: string) => key === "priceEma12" || key === "priceEma26",
      );
      mockedMatchers.isRsi.mockImplementation((key: string) => key === "rsi14");
      mockedMatchers.isVwap.mockImplementation(
        (key: string) => key === "vwap1",
      );
      mockedMatchers.isVwapNumeratorCumulative.mockImplementation(
        (key: string) => key === "vwapNumeratorCumulative",
      );
      mockedMatchers.isVwapDenominatorCumulative.mockImplementation(
        (key: string) => key === "vwapDenominatorCumulative",
      );
      mockedMatchers.isMtsiVwap.mockImplementation(
        (key: string) =>
          key === "mtsiNumeratorVwap1" || key === "mtsiDenominatorVwap1",
      );
      mockedMatchers.isMtsi.mockImplementation(
        (key: string) => key === "mtsiM2N2Vwap2",
      );
      mockedMatchers.isRsiCrossover.mockImplementation(
        (key: string) =>
          key === "rsi14BullishCrossover30PeriodsBefore3PeriodsAfter2",
      );
      mockedMatchers.isMacd.mockImplementation(
        (key: string) => key === "macdFast12Slow26",
      );
      mockedMatchers.isMacdDivergence.mockImplementation(
        (key: string) =>
          key ===
          "macdFast12Slow26BullishDivergenceLookback10PeriodsBefore1PeriodsAfter1",
      );

      mockedParsers.extractPeriod.mockImplementation(
        (key: string) =>
          (
            ({
              priceEma12: 12,
              priceEma26: 26,
              rsi14: 14,
              vwap1: 1,
            }) as Record<string, number>
          )[key] ?? 0,
      );
      mockedParsers.parseMtsiVwapPeriod.mockImplementation(() => 1);
      mockedParsers.parseRsiCrossover.mockImplementation(() => ({
        period: 14,
        bullish: true,
        level: 30,
        before: 3,
        after: 2,
      }));
      mockedParsers.parseMacd.mockImplementation(() => ({
        fast: 12,
        slow: 26,
      }));
      mockedParsers.parseMacdDivergence.mockImplementation(() => ({
        fast: 12,
        slow: 26,
        bullish: true,
        lookback: 10,
        before: 1,
        after: 1,
      }));
      mockedParsers.parseMtsi.mockImplementation(() => ({
        m: 2,
        n: 1,
        vwapPeriod: 1,
      }));

      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest.fn().mockReturnValue({}),
        } as unknown as IStockScreenerJob,
      ];
      const mockTimePeriods: PeriodType[] = [PeriodType.DAY];
      const mockFilterVars: IAllFilterData = initFilterData();
      mockFilterVars[PeriodType.DAY] = {
        vwap1: { AAPL: NaN },
        mtsiM2N2Vwap2: { AAPL: NaN },
        priceEma12: { AAPL: 155 },
        priceEma26: { AAPL: 149 },
        rsi14BullishCrossover30PeriodsBefore3PeriodsAfter2: { AAPL: 0 },
        rsi14: { AAPL: 43 },
        macdFast12Slow26: { AAPL: 163 },
        mtsiNumeratorVwap1Ema2Ema2: { AAPL: -172 },
        mtsiNumeratorVwap1Ema2: { AAPL: -172 },
        mtsiDenominatorVwap1Ema2Ema2: { AAPL: 173 },
        mtsiDenominatorVwap1Ema2: { AAPL: 173 },
        mtsiNumeratorVwap1: { AAPL: 1 },
        mtsiDenominatorVwap1: { AAPL: 1 },
        macdFast12Slow26BullishDivergenceLookback10PeriodsBefore1PeriodsAfter1:
          { AAPL: 0 },
      };
      mockFilterVars[PeriodType.MINUTE] = {
        vwapNumeratorCumulative: { AAPL: 173 },
        vwapDenominatorCumulative: { AAPL: 1 },
      };

      const mockMemories: IAllMemory = initMemories();
      mockMemories[PeriodType.DAY]["price"] = {
        AAPL: {
          lastTime: 0,
          space: 26,
          list: [
            150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 159, 162,
            163, 162, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 174,
          ],
        },
      };

      mockMemories[PeriodType.DAY]["mtsiNumeratorVwap1"] = {
        AAPL: { lastTime: 0, space: 2, list: [170, 173] },
      };
      mockMemories[PeriodType.DAY]["mtsiDenominatorVwap1"] = {
        AAPL: { lastTime: 0, space: 2, list: [172, 174] },
      };
      mockMemories[PeriodType.DAY]["rsi14"] = {
        AAPL: {
          lastTime: 0,
          space: 5,
          list: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
      };
      mockMemories[PeriodType.DAY]["macdFast12Slow26"] = {
        AAPL: {
          lastTime: 0,
          space: 10,
          list: [5, 4, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        },
      };

      const mockData: IStockData[] = [
        { symbol: "AAPL", price: 174, datetime: 123456789, volume: 0 },
      ];
      const mockDatetime = 123456789;

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      expect(mockFilterVars).toEqual({
        ...initFilterData(),
        [PeriodType.DAY]: {
          vwap1: { AAPL: 173 },
          mtsiM2N2Vwap2: { AAPL: 0.4 },
          mtsiNumeratorVwap1Ema2Ema2: { AAPL: 0.3 },
          mtsiNumeratorVwap1Ema2: { AAPL: 0.3 },
          mtsiDenominatorVwap1Ema2Ema2: { AAPL: 0.3 },
          mtsiDenominatorVwap1Ema2: { AAPL: 0.3 },
          mtsiNumeratorVwap1: { AAPL: 0.1 },
          mtsiDenominatorVwap1: { AAPL: 0.2 },
          priceEma12: { AAPL: 3 },
          priceEma26: { AAPL: 3 },
          rsi14: { AAPL: 4 },
          macdFast12Slow26: { AAPL: 6 },
          rsi14BullishCrossover30PeriodsBefore3PeriodsAfter2: { AAPL: 0 },
          macdFast12Slow26BullishDivergenceLookback10PeriodsBefore1PeriodsAfter1:
            { AAPL: 0 },
        },
        [PeriodType.MINUTE]: {
          vwapNumeratorCumulative: { AAPL: 173 },
          vwapDenominatorCumulative: { AAPL: 1 },
        },
      });
      expect(VariableUtil.hasBullishRsiCrossover).toHaveBeenCalledWith(
        [...mockMemories[PeriodType.DAY]["rsi14"]["AAPL"].list.slice(-5)],
        30,
        3,
        2,
      );

      expect(VariableUtil.hasBullishDivergence).toHaveBeenCalledWith(
        [...mockMemories[PeriodType.DAY]["price"]["AAPL"].list.slice(-10)],
        [
          ...mockMemories[PeriodType.DAY]["macdFast12Slow26"][
            "AAPL"
          ].list.slice(-10),
        ],
      );

      mockMemories[PeriodType.DAY]["mtsiNumeratorVwap1"] = {
        AAPL: { lastTime: 0, space: 2, list: [NaN, NaN] },
      };
      mockMemories[PeriodType.DAY]["mtsiDenominatorVwap1"] = {
        AAPL: { lastTime: 0, space: 2, list: [NaN, NaN] },
      };

      mockFilterVars[PeriodType.DAY].mtsiNumeratorVwap1Ema2Ema2 = { AAPL: NaN };
      mockFilterVars[PeriodType.DAY].mtsiNumeratorVwap1Ema2 = { AAPL: NaN };
      mockFilterVars[PeriodType.DAY].mtsiDenominatorVwap1Ema2Ema2 = {
        AAPL: NaN,
      };
      mockFilterVars[PeriodType.DAY].mtsiDenominatorVwap1Ema2 = { AAPL: NaN };

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      expect(
        mockFilterVars[PeriodType.DAY].mtsiNumeratorVwap1Ema2Ema2.AAPL,
      ).toBeNaN();
      expect(mockFilterVars[PeriodType.DAY].mtsiNumeratorVwap1Ema2.AAPL).toBe(
        2,
      ); // this is the mock return value of calculateSma
      expect(
        mockFilterVars[PeriodType.DAY].mtsiDenominatorVwap1Ema2Ema2.AAPL,
      ).toBeNaN();
      expect(mockFilterVars[PeriodType.DAY].mtsiDenominatorVwap1Ema2.AAPL).toBe(
        2,
      ); // this is the mock return value of calculateSma
    });

    it("should handle live data volume as cumulative volume difference", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;

      mockedMatchers.isPercentChange.mockImplementation(() => false);
      mockedMatchers.isVolumeSma.mockImplementation(() => false);
      mockedMatchers.isVolumePercentChange.mockImplementation(() => false);
      mockedMatchers.isPriceSma.mockImplementation(() => false);
      mockedMatchers.isPriceEma.mockImplementation(() => false);
      mockedMatchers.isRsi.mockImplementation(() => false);
      mockedMatchers.isBollingerBands.mockImplementation(() => false);
      mockedMatchers.isVwap.mockImplementation(() => false);
      mockedMatchers.isVwapNumeratorCumulative.mockImplementation(() => false);
      mockedMatchers.isVwapDenominatorCumulative.mockImplementation(
        () => false,
      );
      mockedMatchers.isMtsiVwap.mockImplementation(() => false);
      mockedMatchers.isMtsi.mockImplementation(() => false);

      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest
            .fn()
            .mockReturnValue({ [MemoryType.VOLUME]: { AAPL: 100 } }),
        } as unknown as IStockScreenerJob,
      ];
      const mockTimePeriods: PeriodType[] = [PeriodType.DAY];
      const mockFilterVars: IAllFilterData = initFilterData();
      mockFilterVars[PeriodType.DAY] = {
        [MemoryType.VOLUME]: { AAPL: 100 }, // Previous volume value
      };

      const mockMemories: IAllMemory = initMemories();
      mockMemories[PeriodType.DAY][MemoryType.PRICE] = {
        AAPL: { lastTime: 0, space: 1, list: [150] },
      };

      // Live data (no high/low properties): cumulative volume=250, previous volume=100, so diff=150
      const mockData: IStockData[] = [
        { symbol: "AAPL", price: 150, datetime: 123456789, volume: 250 },
      ];
      const mockDatetime = 123456789;

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      // For live daily data, volume is the full day's volume (not cumulative), so result is 250
      expect(mockFilterVars[PeriodType.DAY][MemoryType.VOLUME].AAPL).toBe(250);
    });

    it("should handle backtest data volume as direct volume", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;

      mockedMatchers.isPercentChange.mockImplementation(() => false);
      mockedMatchers.isVolumeSma.mockImplementation(() => false);
      mockedMatchers.isVolumePercentChange.mockImplementation(() => false);
      mockedMatchers.isPriceSma.mockImplementation(() => false);
      mockedMatchers.isPriceEma.mockImplementation(() => false);
      mockedMatchers.isRsi.mockImplementation(() => false);
      mockedMatchers.isBollingerBands.mockImplementation(() => false);
      mockedMatchers.isVwap.mockImplementation(() => false);
      mockedMatchers.isVwapNumeratorCumulative.mockImplementation(() => false);
      mockedMatchers.isVwapDenominatorCumulative.mockImplementation(
        () => false,
      );
      mockedMatchers.isMtsiVwap.mockImplementation(() => false);
      mockedMatchers.isMtsi.mockImplementation(() => false);

      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest
            .fn()
            .mockReturnValue({ [MemoryType.VOLUME]: { AAPL: 100 } }),
        } as unknown as IStockScreenerJob,
      ];
      const mockTimePeriods: PeriodType[] = [PeriodType.DAY];
      const mockFilterVars: IAllFilterData = initFilterData();
      mockFilterVars[PeriodType.DAY] = {
        [MemoryType.VOLUME]: { AAPL: 100 },
      };

      const mockMemories: IAllMemory = initMemories();
      mockMemories[PeriodType.DAY][MemoryType.PRICE] = {
        AAPL: { lastTime: 0, space: 1, list: [150] },
      };

      // Back-test data (has high/low properties): volume is direct, not cumulative
      const mockData: IStockData[] = [
        {
          symbol: "AAPL",
          price: 150,
          datetime: 123456789,
          volume: 500,
          high: 151,
          low: 149,
        } as unknown as IStockData,
      ];
      const mockDatetime = 123456789;

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      // For back-test data, should use volume directly, not calculate difference
      expect(mockFilterVars[PeriodType.DAY][MemoryType.VOLUME].AAPL).toBe(500);
    });

    it("should handle live data VWAP numerator with volume difference", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;

      mockedMatchers.isPercentChange.mockImplementation(() => false);
      mockedMatchers.isVolumeSma.mockImplementation(() => false);
      mockedMatchers.isVolumePercentChange.mockImplementation(() => false);
      mockedMatchers.isPriceSma.mockImplementation(() => false);
      mockedMatchers.isPriceEma.mockImplementation(() => false);
      mockedMatchers.isRsi.mockImplementation(() => false);
      mockedMatchers.isBollingerBands.mockImplementation(() => false);
      mockedMatchers.isVwap.mockImplementation(() => false);
      mockedMatchers.isVwapNumeratorCumulative.mockImplementation(
        (key: string) => key === "vwapNumeratorCumulative",
      );
      mockedMatchers.isVwapDenominatorCumulative.mockImplementation(
        (key: string) => key === "vwapDenominatorCumulative",
      );
      mockedMatchers.isMtsiVwap.mockImplementation(() => false);
      mockedMatchers.isMtsi.mockImplementation(() => false);

      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest.fn().mockReturnValue({
            vwapNumeratorCumulative: { AAPL: 1000 },
            vwapDenominatorCumulative: { AAPL: 10 },
          }),
        } as unknown as IStockScreenerJob,
      ];
      const mockTimePeriods: PeriodType[] = [PeriodType.DAY];
      const mockFilterVars: IAllFilterData = initFilterData();
      // Set denominator FIRST so it's processed before numerator in the forEach iteration
      mockFilterVars[PeriodType.DAY] = {
        vwapDenominatorCumulative: { AAPL: 10 },
        vwapNumeratorCumulative: { AAPL: 1000 },
      };

      const mockMemories: IAllMemory = initMemories();
      mockMemories[PeriodType.DAY][MemoryType.PRICE] = {
        AAPL: { lastTime: 0, space: 1, list: [150] },
      };

      // Live data: price=150, cumulative volume=250, previous denom=10
      const mockData: IStockData[] = [
        { symbol: "AAPL", price: 150, datetime: 123456789, volume: 250 },
      ];
      const mockDatetime = 123456789;

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      // VWAP numerator: prevVal + (price * (volume - previousDenom))
      // = 1000 + (150 * (250 - 10)) = 1000 + (150 * 240) = 1000 + 36000 = 37000
      expect(
        mockFilterVars[PeriodType.DAY]["vwapNumeratorCumulative"].AAPL,
      ).toBe(37000);
    });

    it("should handle live data VWAP denominator by storing previous and using current volume", () => {
      const mockedMatchers = VariableMatchers as jest.Mocked<
        typeof VariableMatchers
      >;

      mockedMatchers.isPercentChange.mockImplementation(() => false);
      mockedMatchers.isVolumeSma.mockImplementation(() => false);
      mockedMatchers.isVolumePercentChange.mockImplementation(() => false);
      mockedMatchers.isPriceSma.mockImplementation(() => false);
      mockedMatchers.isPriceEma.mockImplementation(() => false);
      mockedMatchers.isRsi.mockImplementation(() => false);
      mockedMatchers.isBollingerBands.mockImplementation(() => false);
      mockedMatchers.isVwap.mockImplementation(() => false);
      mockedMatchers.isVwapNumeratorCumulative.mockImplementation(() => false);
      mockedMatchers.isVwapDenominatorCumulative.mockImplementation(
        (key: string) => key === "vwapDenominatorCumulative",
      );
      mockedMatchers.isMtsiVwap.mockImplementation(() => false);
      mockedMatchers.isMtsi.mockImplementation(() => false);

      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: jest.fn().mockReturnValue("DAY"),
          getVars: jest.fn().mockReturnValue({
            vwapDenominatorCumulative: { AAPL: 10 },
          }),
        } as unknown as IStockScreenerJob,
      ];
      const mockTimePeriods: PeriodType[] = [PeriodType.DAY];
      const mockFilterVars: IAllFilterData = initFilterData();
      mockFilterVars[PeriodType.DAY] = {
        vwapDenominatorCumulative: { AAPL: 10 },
      };

      const mockMemories: IAllMemory = initMemories();
      mockMemories[PeriodType.DAY][MemoryType.PRICE] = {
        AAPL: { lastTime: 0, space: 1, list: [150] },
      };

      // Live data: cumulative volume = 250 (no high/low properties)
      const mockData: IStockData[] = [
        { symbol: "AAPL", price: 150, datetime: 123456789, volume: 250 },
      ];
      const mockDatetime = 123456789;

      filterVarsHelper.transferVars(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
      );

      // For live data VWAP denominator, should use current volume (not accumulate)
      expect(
        mockFilterVars[PeriodType.DAY]["vwapDenominatorCumulative"].AAPL,
      ).toBe(250);
    });
  });
});
