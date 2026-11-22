import { PeriodType, CONSTANTS } from "../../shared/constants";
import { IAnalysisData } from "../../analysis/analysis-types";
import { BackTestHelper } from "../../back-testing/back-test-helper";
import { SchwabAPI } from "../../shared/services/trading-api";
import { ICandleData } from "../../types/back-test-types";
import { IFilter } from "../../types/strategy-types";

jest.mock("../../shared/services/trading-api");
jest.mock("../../shared/utilities/time-util", () => ({
  getOffset: jest.fn().mockReturnValue(0),
}));
jest.mock("../../shared/utilities/strategy-util", () => ({
  StrategyUtil: {
    convertToVariableName: jest.fn().mockReturnValue("percentchange1"),
  },
}));

describe("BackTestHelper", () => {
  let backTestHelper: BackTestHelper;

  beforeAll(() => {
    backTestHelper = new BackTestHelper(true);
  });

  const mockAppleCandleData: ICandleData = {
    symbol: "AAPL",
    candles: [
      {
        open: 4,
        close: 5,
        datetime: 1609459200000 - 1800000,
        high: 0,
        low: 0,
        volume: 0,
      },
      {
        open: 5,
        close: 6,
        datetime: 1609459200000 + 1800000,
        high: 0,
        low: 0,
        volume: 0,
      },
    ],
    empty: false,
    index: 0,
  };

  const mockGoogleCandleData: ICandleData = {
    symbol: "GOOGL",
    candles: [
      {
        open: 3,
        close: 4,
        datetime: 1609459200000 - 1800000,
        high: 0,
        low: 0,
        volume: 0,
      },
      {
        open: 4,
        close: 5,
        datetime: 1609459200000 + 1800000,
        high: 0,
        low: 0,
        volume: 0,
      },
    ],
    empty: false,
    index: 0,
  };

  describe("initCandleData", () => {
    it("should initialize candle data", async () => {
      const mockStartTime = 1609459200000 - 1800000;
      const mockEndTime = 1612137600000;
      const mockCandleData: ICandleData = mockAppleCandleData;

      const mockCandleData2: ICandleData = mockGoogleCandleData;
      const config = { startTime: mockStartTime, endTime: mockEndTime };
      const mockStockNames = ["AAPL", "GOOGL"];
      jest
        .spyOn(SchwabAPI, "getHistoryWithBounds")
        .mockResolvedValueOnce(mockCandleData);
      jest
        .spyOn(SchwabAPI, "getHistoryWithBounds")
        .mockResolvedValueOnce(mockCandleData2);

      const result = await backTestHelper.initCandleData(
        config,
        [PeriodType.HOUR],
        mockStockNames,
      );

      expect(result).toEqual({
        [PeriodType.HOUR]: {
          AAPL: { ...mockCandleData },
          GOOGL: { ...mockCandleData2 },
        },
      });
    });

    describe("UTC branch adjustments (Polygon / useShwab=false)", () => {
      // System time fixed to 2024-01-15T12:00:00Z (EST = UTC-5 → easternOffsetMin = 300)
      // Candle time chosen so that `mins` hits the target switch case.
      // mins = (1440 + 60*date.getHours() + date.getMinutes() - 300) % 1440  (UTC machine)

      afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
      });

      it("case 60: isUTC+non-Schwab adjusts datetime by +16h-1m", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2024-01-15T12:00:00Z"));
        jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({ resolvedOptions: () => ({ timeZone: "UTC" }) }) as unknown as Intl.DateTimeFormat);

        const helper = new BackTestHelper(false);
        // UTC 06:00 → mins = (1440 + 360 - 300) % 1440 = 60
        const candleTime = Date.UTC(2024, 0, 15, 6, 0, 0);

        jest.spyOn(SchwabAPI, "getStockHistoryPolygon").mockResolvedValue({
          ticker: "AAPL",
          results: [{ t: candleTime, o: 10, h: 11, l: 9, c: 10.5, v: 1000 }],
        } as Awaited<ReturnType<typeof SchwabAPI.getStockHistoryPolygon>>);

        const result = await helper.initCandleData(
          { startTime: candleTime - 86400000, endTime: candleTime + 86400000 },
          [PeriodType.DAY],
          ["AAPL"],
        );

        expect(result[PeriodType.DAY]?.["AAPL"]?.candles?.[0]?.datetime).toBe(
          candleTime +
            (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE),
        );
      });

      it("default: isUTC+non-Schwab+mins=1380 adjusts datetime by +16h-1m", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2024-01-15T12:00:00Z"));
        jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({ resolvedOptions: () => ({ timeZone: "UTC" }) }) as unknown as Intl.DateTimeFormat);

        const helper = new BackTestHelper(false);
        // UTC 04:00 → mins = (1440 + 240 - 300) % 1440 = 1380
        const candleTime = Date.UTC(2024, 0, 15, 4, 0, 0);

        jest.spyOn(SchwabAPI, "getStockHistoryPolygon").mockResolvedValue({
          ticker: "AAPL",
          results: [{ t: candleTime, o: 10, h: 11, l: 9, c: 10.5, v: 1000 }],
        } as Awaited<ReturnType<typeof SchwabAPI.getStockHistoryPolygon>>);

        const result = await helper.initCandleData(
          { startTime: candleTime - 86400000, endTime: candleTime + 86400000 },
          [PeriodType.DAY],
          ["AAPL"],
        );

        expect(result[PeriodType.DAY]?.["AAPL"]?.candles?.[0]?.datetime).toBe(
          candleTime +
            (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE),
        );
      });

      it("default: non-UTC path throws for unrecognized candle time", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2024-01-15T12:00:00Z"));
        jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({ resolvedOptions: () => ({ timeZone: "America/New_York" }) }) as unknown as Intl.DateTimeFormat);

        const helper = new BackTestHelper(false);
        // Same UTC 04:00 candle → mins=1380, but isUTC=false → throwError stays true → throws
        const candleTime = Date.UTC(2024, 0, 15, 4, 0, 0);

        jest.spyOn(SchwabAPI, "getStockHistoryPolygon").mockResolvedValue({
          ticker: "AAPL",
          results: [{ t: candleTime, o: 10, h: 11, l: 9, c: 10.5, v: 1000 }],
        } as Awaited<ReturnType<typeof SchwabAPI.getStockHistoryPolygon>>);

        await expect(
          helper.initCandleData(
            {
              startTime: candleTime - 86400000,
              endTime: candleTime + 86400000,
            },
            [PeriodType.DAY],
            ["AAPL"],
          ),
        ).rejects.toThrow(/Invalid time for daily candle adjustment/);
      });
    });
  });

  describe("getTestData", () => {
    it("should return empty object when no periods are provided", () => {
      backTestHelper.candleData = {};
      const result = backTestHelper.getTestData(1620000000000, [], 0);
      expect(result).toEqual({});
    });

    it("should return empty object when candleData for period does not exist", () => {
      backTestHelper.candleData = {};
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.MINUTE],
        0,
      );
      expect(result).toEqual({}); // Changed: return {} not { [PeriodType.MINUTE]: [] }
    });

    it("should skip symbol if candleData is null or candles array is empty", () => {
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles: [], index: 0, empty: false, symbol: "AAPL" },
          GOOGL: null as unknown as ICandleData,
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.MINUTE],
        0,
      );
      expect(result[PeriodType.MINUTE]).toEqual([]);
    });

    it("should skip if there are no candles at current index", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 5, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.MINUTE],
        0,
      );
      expect(result[PeriodType.MINUTE]).toEqual([]);
    });

    it("should advance index until datetime matches candle datetime", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000060000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
        {
          datetime: 1620000120000,
          open: 105,
          high: 108,
          low: 103,
          close: 106,
          volume: 1200,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000120000,
        [PeriodType.MINUTE],
        60,
      );
      expect(result[PeriodType.MINUTE]?.length).toBe(1);
      expect(result[PeriodType.MINUTE]?.[0].symbol).toBe("AAPL");
      expect(result[PeriodType.MINUTE]?.[0].close).toBe(105); // Previous candle's close
    });

    it("should use previous candle close for sub-day periods when minutesSinceStart > 0", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000060000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000060000,
        [PeriodType.MINUTE],
        1,
      );
      expect(result[PeriodType.MINUTE]?.[0].price).toBe(102); // Previous candle's close
      expect(result[PeriodType.MINUTE]?.[0].tradePrice).toBe(102); // Changed: Current candle's close, not open
    });

    it("should skip if minutesSinceStart is 0 for sub-day periods and no previous candle", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.MINUTE],
        0,
      );
      expect(result[PeriodType.MINUTE]).toEqual([]);
    });

    it("should use current candle close for DAY period regardless of minutesSinceStart", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.DAY]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.DAY],
        0,
      );
      expect(result[PeriodType.DAY]?.[0].price).toBe(102);
      expect(result[PeriodType.DAY]?.[0].tradePrice).toBe(102);
    });

    it("should process multiple symbols in same period", () => {
      const candlesAAPL = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      const candlesGOOGL = [
        {
          datetime: 1620000000000,
          open: 200,
          high: 210,
          low: 190,
          close: 205,
          volume: 2000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.DAY]: {
          AAPL: {
            candles: candlesAAPL,
            index: 0,
            empty: false,
            symbol: "AAPL",
          },
          GOOGL: {
            candles: candlesGOOGL,
            index: 0,
            empty: false,
            symbol: "GOOGL",
          },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.DAY],
        0,
      );
      expect(result[PeriodType.DAY]?.length).toBe(2);
      expect(result[PeriodType.DAY]?.[0].symbol).toBe("AAPL");
      expect(result[PeriodType.DAY]?.[1].symbol).toBe("GOOGL");
    });

    it("should process multiple periods independently", () => {
      const minuteCandles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      const dayCandles = [
        {
          datetime: 1620000000000,
          open: 150,
          high: 160,
          low: 140,
          close: 155,
          volume: 10000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: {
            candles: minuteCandles,
            index: 0,
            empty: false,
            symbol: "AAPL",
          },
        },
        [PeriodType.DAY]: {
          AAPL: { candles: dayCandles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.MINUTE, PeriodType.DAY],
        1,
      );
      expect(result[PeriodType.MINUTE]).toEqual([]);
      expect(result[PeriodType.DAY]?.length).toBe(1);
      expect(result[PeriodType.DAY]?.[0].price).toBe(155);
    });

    it("should update candleData index after processing", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000060000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
        {
          datetime: 1620000120000,
          open: 105,
          high: 108,
          low: 103,
          close: 106,
          volume: 1200,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      backTestHelper.getTestData(1620000060000, [PeriodType.MINUTE], 1);
      expect(backTestHelper.candleData[PeriodType.MINUTE]?.["AAPL"].index).toBe(
        1,
      );
    });

    it("should skip symbol if no candles exist at updated index", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000120000,
        [PeriodType.MINUTE],
        1,
      );
      expect(result[PeriodType.MINUTE]).toEqual([]);
    });

    it("should include all candle properties in output", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.DAY]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000,
        [PeriodType.DAY],
        0,
      );
      const data = result[PeriodType.DAY]?.[0];
      expect(data).toMatchObject({
        datetime: 1620000000000,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        symbol: "AAPL",
        price: 102,
        tradePrice: 102,
      });
    });

    it("should handle datetime at boundary (end of candles array)", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000060000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000060000,
        [PeriodType.MINUTE],
        1,
      );
      expect(result[PeriodType.MINUTE]?.length).toBe(1);
      expect(backTestHelper.candleData[PeriodType.MINUTE]?.["AAPL"].index).toBe(
        1,
      );
    });

    it("should handle multiple symbols with different indices", () => {
      const candlesAAPL = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000060000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
      ];
      const candlesGOOGL = [
        {
          datetime: 1620000000000,
          open: 200,
          high: 210,
          low: 190,
          close: 205,
          volume: 2000,
        },
        {
          datetime: 1620000060000,
          open: 205,
          high: 215,
          low: 200,
          close: 210,
          volume: 2100,
        },
        {
          datetime: 1620000120000,
          open: 210,
          high: 220,
          low: 205,
          close: 215,
          volume: 2200,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.MINUTE]: {
          AAPL: {
            candles: candlesAAPL,
            index: 0,
            empty: false,
            symbol: "AAPL",
          },
          GOOGL: {
            candles: candlesGOOGL,
            index: 0,
            empty: false,
            symbol: "GOOGL",
          },
        },
      };
      const result = backTestHelper.getTestData(
        1620000060000,
        [PeriodType.MINUTE],
        1,
      );
      expect(result[PeriodType.MINUTE]?.length).toBe(2);
      expect(backTestHelper.candleData[PeriodType.MINUTE]?.["AAPL"].index).toBe(
        1,
      );
      expect(
        backTestHelper.candleData[PeriodType.MINUTE]?.["GOOGL"].index,
      ).toBe(1);
    });

    it("should handle HOUR period correctly", () => {
      const candles = [
        {
          datetime: 1620000000000,
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          datetime: 1620000000000 + 3600000,
          open: 102,
          high: 107,
          low: 100,
          close: 105,
          volume: 1100,
        },
      ];
      backTestHelper.candleData = {
        [PeriodType.HOUR]: {
          AAPL: { candles, index: 0, empty: false, symbol: "AAPL" },
        },
      };
      const result = backTestHelper.getTestData(
        1620000000000 + 3600000,
        [PeriodType.HOUR],
        1,
      );
      expect(result[PeriodType.HOUR]?.length).toBe(1);
      expect(result[PeriodType.HOUR]?.[0].price).toBe(102); // Previous candle's close
      expect(result[PeriodType.HOUR]?.[0].tradePrice).toBe(102); // Current candle's close
    });
  });

  describe("collectData", () => {
    it("should collect data for scenarios", async () => {
      backTestHelper.candleData = {
        [PeriodType.HOUR]: {
          AAPL: {
            symbol: "AAPL",
            candles: [
              {
                open: 4,
                close: 5,
                datetime: 1609459200000 - 1800000,
                high: 0,
                low: 0,
                volume: 0,
              },
              {
                open: 5,
                close: 6,
                datetime: 1609459200000 + 1800000,
                high: 0,
                low: 0,
                volume: 0,
              },
            ],
            empty: false,
            index: 1,
          },
        },
      };

      const mockScenarios: IAnalysisData[] = [
        {
          symbol: "AAPL",
          price: 5,
          time: 1609459200000 + 1800000,
          variableValues: {},
        },
      ];
      const mockPeriodLength = PeriodType.HOUR;
      const mockDataFilters: IFilter[] = [
        {
          varName: "percentchange",
          operator: ">",
          compareVal: "1",
          timeAgo: "1",
        },
      ];

      const result = backTestHelper.collectData(
        mockScenarios,
        mockPeriodLength,
        mockDataFilters,
      );

      // percentchange = ((6 - 5) / 5) * 100 = 20
      expect(result).toEqual([
        {
          symbol: "AAPL",
          price: 6,
          time: 1609459200000 + 1800000,
          percentchange1: 20,
        },
      ]);
    });
  });

  describe("getHistory", () => {
    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    it("creates requests lazily per batch and does not start later batch early", async () => {
      jest.useFakeTimers();
      const helper = new BackTestHelper(true);
      const symbols = Array.from({ length: 251 }, (_, i) => `SYM${i}`);

      const resolvedCandle: ICandleData = {
        symbol: "SYM",
        candles: [],
        empty: false,
        index: 0,
      };

      let resolveFirst: ((value: ICandleData) => void) | undefined;
      const firstPending = new Promise<ICandleData>((resolve) => {
        resolveFirst = resolve;
      });

      const spy = jest
        .spyOn(SchwabAPI, "getHistoryWithBounds")
        .mockImplementation((symbol: string) => {
          if (symbol === "SYM0") {
            return firstPending;
          }
          return Promise.resolve({ ...resolvedCandle, symbol });
        });

      const historyPromise = helper.getHistory("day", 1, symbols, 1, 2);

      await Promise.resolve();
      expect(spy).toHaveBeenCalledTimes(250);

      resolveFirst?.({ ...resolvedCandle, symbol: "SYM0" });
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(10000);
      const result = await historyPromise;

      expect(spy).toHaveBeenCalledTimes(251);
      expect(result).toHaveLength(251);
    });

    it("rejects when a batch request fails", async () => {
      const helper = new BackTestHelper(true);
      const rejection = new Error("429 too many requests");

      jest
        .spyOn(SchwabAPI, "getHistoryWithBounds")
        .mockRejectedValueOnce(rejection);

      await expect(
        helper.getHistory("day", 1, ["AAPL"], 1, 2),
      ).rejects.toThrow("429 too many requests");
    });
  });
});
