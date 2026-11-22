import { MemoryType, PeriodType } from "../../shared/constants";
import { MemoriesHelper } from "../../run/memories-helper";
import {
  IAllFilterData,
  IAllStockNames,
  IAllMemory,
  IStockData,
} from "../../types/data-processing-types";
import {
  initFilterData,
  initMemories,
  initStockNames,
} from "../../shared/utilities/run-util";
import {
  VariableMatchers,
  VariableParsers,
  VariableBuilders,
} from "../../shared/utilities/variable-patterns";

const FIRST_AAPL_PRICE = 155;
const SECOND_AAPL_PRICE = 255;
const THIRD_AAPL_PRICE = 160;
const FOURTH_AAPL_PRICE = 150;
const FIFTH_AAPL_PRICE = 180;
const VWAP_NUMERATOR_CUM = 10000;
const VWAP_DENOM_CUM = 1000;
const VOL_MINUTE = 1;
const MTSI_NUMERATOR_VAL_1 = 2.726458422219982;
const MTSI_NUMERATOR_VAL_2 = 3.2188758248682006;

const VOLUME_AAPL_DAY_VAL = 100;
const SPACE_VAL = 2;
const DATE_TIME_VAL = 1620000060000;
const MILLIS_BETWEEN_4_PM_AND_930_AM = 63000000;

jest.mock("../../shared/utilities/variable-calculations", () => ({
  calculateMtsiNumerator: jest
    .fn()
    .mockReturnValueOnce(2.726458422219982)
    .mockReturnValueOnce(3.2188758248682006),

  calculateMtsiDenominator: jest.fn().mockReturnValue(42),

  calculateMacd: jest.fn().mockReturnValue(5),

  calculateMtsiEma: jest.fn().mockImplementation((currentValue: number) => {
    // deterministic but simple
    return currentValue;
  }),
}));

jest.mock("../../shared/utilities/variable-patterns", () => ({
  VariableMatchers: {
    isPercentChange: jest.fn(),
    isVolumeSma: jest.fn(),
    isVolumePercentChange: jest.fn(),
    isPriceSma: jest.fn(),
    isPriceEma: jest.fn(),
    isRsi: jest.fn(),
    isBollingerBands: jest.fn(),
    isMtsiVwap: jest.fn(),
    isMtsi: jest.fn(),
    isRsiDivergence: jest.fn(),
    isRsiCrossover: jest.fn(),
    isMacd: jest.fn(),
    isMacdSignal: jest.fn(),
    isMacdDivergence: jest.fn(),
    isMacdCrossover: jest.fn(),
    isPricePercentChangePercentile: jest.fn(),
  },
  VariableParsers: {
    extractPeriod: jest.fn(),
    parseMtsiVwapPeriod: jest.fn(),
    parseRsiCrossover: jest.fn(),
    parseRsiDivergence: jest.fn(),
    parseMacd: jest.fn(),
    parseMacdSignal: jest.fn(),
    parseMacdDivergence: jest.fn(),
    parseMtsi: jest.fn(),
    parsePricePercentChangePercentile: jest.fn(),
  },
  VariablePatterns: {
    mtsiVwapEma1: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)$/,
    mtsiVwapEma2: /^mtsi(Numerator|Denominator)Vwap(\d+)Ema(\d+)Ema(\d+)$/,
    macdCrossover:
      /^macdFast(\d+)Slow(\d+)Signal(\d+)(Bullish|Bearish)CrossoverPeriodsBefore(\d+)PeriodsAfter(\d+)$/,
  },
  VariableBuilders: {
    priceEma: jest.fn(),
    macd: jest.fn(),
    macdSignal: jest.fn(),
    mtsiVwap: jest.fn(),
    mtsiVwapEma: jest.fn(),
    tsiMemoryKey: jest.fn(),
    tsiEmaMemoryKey: jest.fn(),
  },
}));

const fillWithNaN = (size: number) => new Array(size).fill(NaN);

describe("MemoriesHelper", () => {
  const defaultMemories = initMemories();

  beforeEach(() => {
    const mockedMatchers = VariableMatchers as jest.Mocked<
      typeof VariableMatchers
    >;
    const mockedParsers = VariableParsers as jest.Mocked<
      typeof VariableParsers
    >;
    const mockedBuilders = VariableBuilders as jest.Mocked<
      typeof VariableBuilders
    >;

    // ----- MATCHERS -----
    mockedMatchers.isMtsiVwap.mockImplementation(
      (key) => key === "mtsiNumeratorVwap1" || key === "mtsiDenominatorVwap1",
    );

    mockedMatchers.isMtsi.mockImplementation((key) => key === "mtsiM2N1Vwap1");

    mockedMatchers.isMacd.mockImplementation(
      (key) => key === "macdFast12Slow26",
    );

    mockedMatchers.isMacdSignal.mockImplementation(
      (key) => key === "macdFast12Slow26Signal9",
    );
    mockedMatchers.isRsiCrossover.mockImplementation(
      (key: string) =>
        key === "rsi14BullishCrossover30PeriodsBefore1PeriodsAfter1",
    );

    mockedMatchers.isMacdDivergence.mockImplementation(
      (key: string) =>
        key ===
        "macdFast12Slow26BullishDivergenceLookback10PeriodsBefore1PeriodsAfter1",
    );

    mockedMatchers.isMacdCrossover.mockImplementation(
      (key: string) =>
        key ===
        "macdFast11Slow25Signal8BullishCrossoverPeriodsBefore2PeriodsAfter3",
    );
    // everything else false
    Object.values(mockedMatchers).forEach((fn) => {
      if (fn.getMockImplementation() == null) {
        fn.mockReturnValue(false);
      }
    });

    //   // ----- PARSERS -----
    mockedParsers.parseMtsiVwapPeriod.mockImplementation((key) => {
      if (key === "mtsiNumeratorVwap1" || key === "mtsiDenominatorVwap1") {
        return 1;
      }
      return 0;
    });

    mockedParsers.parseMtsi.mockImplementation((key) => {
      if (key === "mtsiM2N1Vwap1") {
        return { m: 2, n: 1, vwapPeriod: 1 };
      }
      return null;
    });

    mockedParsers.parseMacd.mockImplementation((key) => {
      if (key === "macdFast12Slow26") {
        return { fast: 12, slow: 26 };
      }
      return null;
    });

    mockedParsers.parseMacdSignal.mockImplementation((key) => {
      if (key === "macdFast12Slow26Signal9") {
        return { fast: 12, slow: 26, signal: 9 };
      }
      return null;
    });

    mockedParsers.parseRsiCrossover.mockImplementation(() => ({
      period: 14,
      bullish: true,
      level: 30,
      before: 1,
      after: 1,
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

    mockedBuilders.priceEma.mockImplementation(
      (period: number) => `priceEma${period}`,
    );
    mockedBuilders.macd.mockImplementation(
      (fast: number, slow: number) => `macdFast${fast}Slow${slow}`,
    );
    mockedBuilders.macdSignal.mockImplementation(
      (fast: number, slow: number, signal: number) =>
        `macdFast${fast}Slow${slow}Signal${signal}`,
    );
    mockedBuilders.mtsiVwap.mockImplementation(
      (vwapPeriod: number, isNumerator: boolean) =>
        `mtsi${isNumerator ? "Numerator" : "Denominator"}Vwap${vwapPeriod}`,
    );
    mockedBuilders.mtsiVwapEma.mockImplementation(
      (vwapPeriod: number, emaPeriod: number, isNumerator: boolean) =>
        `mtsi${isNumerator ? "Numerator" : "Denominator"}Vwap${vwapPeriod}Ema${emaPeriod}`,
    );
    mockedBuilders.tsiMemoryKey.mockImplementation((isNumerator: boolean) =>
      isNumerator ? "tsiNumerator" : "tsiDenominator",
    );
    mockedBuilders.tsiEmaMemoryKey.mockImplementation(
      (isNumerator: boolean, m: number) =>
        isNumerator ? `tsiNumeratorEma${m}` : `tsiDenominatorEma${m}`,
    );
  });

  describe("initMemories", () => {
    it("should initialize memories correctly", () => {
      const allNames = initStockNames();
      const allVars = initFilterData();
      allVars[PeriodType.DAY] = {
        percentchange1: { AAPL: 0, GOOGL: 0 },
        volumechange2: { AAPL: 0, GOOGL: 0 },
        rsi14BullishCrossover30PeriodsBefore1PeriodsAfter1: { AAPL: 0 },
        mtsiM2N1Vwap1: { AAPL: 0 },
        macdFast12Slow26BullishDivergenceLookback10PeriodsBefore1PeriodsAfter1:
          { AAPL: 0 },
        macdFast11Slow25Signal8BullishCrossoverPeriodsBefore2PeriodsAfter3: {
          AAPL: 0,
        },
        tsiM2N1: { AAPL: 0 },
      };

      allNames[PeriodType.DAY] = ["AAPL", "GOOGL"];
      const defaultMemSpace = 2;
      const priceSpace = 26;

      const expectedMemories: Partial<IAllMemory> = {
        [PeriodType.DAY]: {
          mtsiDenominatorVwap1: {
            AAPL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
            GOOGL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
          },
          mtsiNumeratorVwap1: {
            AAPL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
            GOOGL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
          },

          [MemoryType.VOLUME]: {},
          [MemoryType.PRICE]: {
            AAPL: {
              space: priceSpace,
              list: fillWithNaN(priceSpace),
              lastTime: 0,
            },
            GOOGL: {
              space: priceSpace,
              list: fillWithNaN(priceSpace),
              lastTime: 0,
            },
          },
          rsi14: {
            AAPL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
            GOOGL: {
              space: defaultMemSpace,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
          },
          macdFast12Slow26: {
            AAPL: { space: 10, list: fillWithNaN(10), lastTime: 0 },
            GOOGL: { space: 10, list: fillWithNaN(10), lastTime: 0 },
          },
          macdFast11Slow25: {
            AAPL: { space: 8, list: fillWithNaN(8), lastTime: 0 },
            GOOGL: { space: 8, list: fillWithNaN(8), lastTime: 0 },
          },
          macdFast11Slow25Signal8: {
            AAPL: { space: 5, list: fillWithNaN(5), lastTime: 0 },
            GOOGL: { space: 5, list: fillWithNaN(5), lastTime: 0 },
          },
          tsiNumerator: {
            AAPL: { space: 2, list: fillWithNaN(defaultMemSpace), lastTime: 0 },
            GOOGL: {
              space: 2,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
          },
          tsiDenominator: {
            AAPL: { space: 2, list: fillWithNaN(defaultMemSpace), lastTime: 0 },
            GOOGL: {
              space: 2,
              list: fillWithNaN(defaultMemSpace),
              lastTime: 0,
            },
          },
        },
      };

      const result = MemoriesHelper.initMemories(allVars, allNames);
      expect(result).toEqual({ ...defaultMemories, ...expectedMemories });
    });

    it("should handle empty inputs", () => {
      const allVars: IAllFilterData = initFilterData();
      const allNames: IAllStockNames = initStockNames();

      const result = MemoriesHelper.initMemories(allVars, allNames);
      expect(result).toEqual(defaultMemories);
    });

    it("should handle missing periods", () => {
      const allVars: IAllFilterData = initFilterData();
      allVars[PeriodType.DAY] = {
        AAPL: { price: FOURTH_AAPL_PRICE, volume: VOLUME_AAPL_DAY_VAL },
      };

      const allNames: IAllStockNames = initStockNames();
      allNames[PeriodType.HOUR] = ["AAPL"];

      const result = MemoriesHelper.initMemories(allVars, allNames);
      expect(result).toEqual(defaultMemories);
    });
  });

  describe("adjustMemory", () => {
    it("should update memory list correctly, and reset minute memories after a day", () => {
      const candleDateTime = 1619985600000;
      const nextMorningTime = candleDateTime + MILLIS_BETWEEN_4_PM_AND_930_AM;
      const previousDays = 3;
      const lastTime = candleDateTime - previousDays * 60000;
      const data = [
        {
          symbol: "AAPL",
          datetime: candleDateTime,
          price: FIRST_AAPL_PRICE,
          volume: 0,
        },
      ];
      const space = 8;
      const list = fillWithNaN(space);
      list[space - 1] = THIRD_AAPL_PRICE; // last value in memory is from 3 minutes ago, so we should shift and add new price at the end
      const timePeriods = [PeriodType.MINUTE];
      const allMemories: IAllMemory = initMemories();
      allMemories[PeriodType.MINUTE] = {
        [MemoryType.PRICE]: {
          AAPL: { space, list, lastTime },
        },
        [MemoryType.VOLUME]: {},
      };

      MemoriesHelper.adjustMemory(data, timePeriods, allMemories);
      const priceMem = allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"];
      const priceList = priceMem.list;
      expect(priceList).toEqual([
        NaN,
        NaN,
        NaN,
        NaN,
        THIRD_AAPL_PRICE,
        NaN,
        NaN,
        FIRST_AAPL_PRICE,
      ]);
      expect(priceMem.lastTime).toEqual(candleDateTime);

      const data2 = [
        {
          symbol: "AAPL",
          datetime: nextMorningTime,
          price: FIFTH_AAPL_PRICE,
          volume: 0,
        },
      ];
      MemoriesHelper.adjustMemory(data2, timePeriods, allMemories);

      expect(priceList).toEqual([
        NaN,
        NaN,
        NaN,
        NaN,
        NaN,
        NaN,
        NaN,
        FIFTH_AAPL_PRICE,
      ]);
      expect(
        priceList.reduce((acc, val) => acc + val, 0) / priceList.length,
      ).toEqual(NaN);
    });

    it("should update mtsiNumerator", () => {
      const dateTimeValOneMinuteAgo = DATE_TIME_VAL - 60000;
      const data = {
        [PeriodType.DAY]: [
          {
            symbol: "AAPL",
            datetime: DATE_TIME_VAL,
            price: FIRST_AAPL_PRICE,
            volume: VOLUME_AAPL_DAY_VAL,
          },
        ],
        [PeriodType.MINUTE]: [
          {
            symbol: "AAPL",
            datetime: DATE_TIME_VAL,
            price: FIRST_AAPL_PRICE,
            volume: VOL_MINUTE,
          },
        ],
      };

      const mtsiNumeratorVal = Math.log(
        FIRST_AAPL_PRICE /
          ((VWAP_NUMERATOR_CUM + FIRST_AAPL_PRICE) /
            (VWAP_DENOM_CUM + VOL_MINUTE)),
      );
      const timePeriods = [PeriodType.MINUTE, PeriodType.DAY];
      const allMemories: IAllMemory = initMemories();
      allMemories[PeriodType.MINUTE] = {
        [MemoryType.PRICE]: {
          AAPL: {
            space: SPACE_VAL,
            list: [FOURTH_AAPL_PRICE],
            lastTime: dateTimeValOneMinuteAgo,
          },
        },
        [MemoryType.VOLUME]: {},
      };
      allMemories[PeriodType.DAY] = {
        mtsiNumeratorVwap1: {
          AAPL: {
            space: SPACE_VAL,
            list: [0, 1],
            lastTime: dateTimeValOneMinuteAgo,
          },
        },
      };
      const allVars = initFilterData();
      allVars[PeriodType.MINUTE] = {
        vwapNumeratorCumulative: { AAPL: VWAP_NUMERATOR_CUM },
        vwapDenominatorCumulative: { AAPL: VWAP_DENOM_CUM },
      };
      MemoriesHelper.adjustMemory(data, timePeriods, allMemories, allVars);

      expect(
        allMemories[PeriodType.DAY]["mtsiNumeratorVwap1"]["AAPL"].list,
      ).toEqual([1, mtsiNumeratorVal]);
      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"].lastTime,
      ).toEqual(DATE_TIME_VAL);

      const data2 = {
        [PeriodType.DAY]: [
          {
            symbol: "AAPL",
            datetime: DATE_TIME_VAL,
            price: SECOND_AAPL_PRICE,
            volume: 3000,
          },
        ],
      };
      MemoriesHelper.adjustMemory(data2, timePeriods, allMemories, allVars);
      expect(
        allMemories[PeriodType.DAY]["mtsiNumeratorVwap1"]["AAPL"].list,
      ).toEqual([MTSI_NUMERATOR_VAL_1, MTSI_NUMERATOR_VAL_2]);
    });

    it("should handle empty data", () => {
      const data: IStockData[] = [];
      const timePeriods = [PeriodType.MINUTE];
      const dateTimeVal = DATE_TIME_VAL - 60000;
      const allMemories: IAllMemory = initMemories();
      allMemories[PeriodType.MINUTE] = {
        [MemoryType.PRICE]: {
          AAPL: {
            space: SPACE_VAL,
            list: [THIRD_AAPL_PRICE],
            lastTime: dateTimeVal,
          },
        },
        [MemoryType.VOLUME]: {},
      };

      MemoriesHelper.adjustMemory(data, timePeriods, allMemories);

      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"].list,
      ).toEqual([THIRD_AAPL_PRICE]);
      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"].lastTime,
      ).toEqual(dateTimeVal);
    });

    it("should handle missing memories for a stock", () => {
      const dateTimeVal = DATE_TIME_VAL - 60000;
      const data = [
        {
          symbol: "AAPL",
          datetime: dateTimeVal,
          price: FOURTH_AAPL_PRICE,
          volume: 0,
        },
      ];
      const timePeriods = [PeriodType.MINUTE];
      const allMemories: IAllMemory = initMemories();
      allMemories[PeriodType.MINUTE] = {
        [MemoryType.PRICE]: {},
        [MemoryType.VOLUME]: {},
      };
      allMemories[PeriodType.FIVE_MINUTES] = {
        [MemoryType.PRICE]: {},
        [MemoryType.VOLUME]: {},
      };

      MemoriesHelper.adjustMemory(data, timePeriods, allMemories);

      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"],
      ).toBeUndefined();
    });

    it("should trim memory list if it exceeds space", () => {
      const dateTimeVal = 1620003660000;
      const dateTimeValOneMinuteAgo = dateTimeVal - 60000;
      const data = [
        {
          symbol: "AAPL",
          datetime: dateTimeVal,
          price: THIRD_AAPL_PRICE,
          volume: 0,
        },
      ];
      const timePeriods = [PeriodType.MINUTE];
      const allMemories: IAllMemory = initMemories();
      allMemories[PeriodType.MINUTE] = {
        [MemoryType.PRICE]: {
          AAPL: {
            space: SPACE_VAL,
            list: [FOURTH_AAPL_PRICE, FIRST_AAPL_PRICE],
            lastTime: dateTimeValOneMinuteAgo,
          },
        },
        [MemoryType.VOLUME]: {},
      };

      MemoriesHelper.adjustMemory(data, timePeriods, allMemories);

      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"].list,
      ).toEqual([FIRST_AAPL_PRICE, THIRD_AAPL_PRICE]);
      expect(
        allMemories[PeriodType.MINUTE][MemoryType.PRICE]["AAPL"].lastTime,
      ).toEqual(dateTimeVal);
    });
  });
});
