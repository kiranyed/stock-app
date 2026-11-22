import { CONSTANTS, PeriodType } from "../../shared/constants";
import { BackTest } from "../../back-testing/back-test";
import { ICandle } from "../../types/back-test-types";
import { IStockData } from "../../types/data-processing-types";
import { Screener } from "../../shared/classes/screener";
import { IScreener } from "../../types/strategy-types";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";

// jest.mock('../../analysis/analyze-gains', () => ({
//     GainsAnalyzer: jest.fn(() => ({
//         addGains: jest.fn().mockReturnValue(100)
//     }))
// }));

jest.mock("../../analysis/analyze-gains", () => ({
  GainsAnalyzer: jest.fn().mockImplementation(() => ({
    addGains: jest.fn().mockReturnValue(100), // Mock the addGains method
  })),
}));

jest.mock("../../shared/classes/screener", () => ({
  Screener: jest.fn().mockImplementation(() => ({
    runSellFilters: jest.fn().mockReturnValue(false),
    runBuyFilters: jest.fn().mockReturnValue(true),
    getAllVariables: jest.fn().mockReturnValue(["timeSinceEntry"]),
    hasFlags: jest.fn().mockReturnValue(false),
    hasBuySellFilters: jest.fn().mockReturnValue(true),
    hasShortCoverFilters: jest.fn().mockReturnValue(false),
  })),
}));

jest.mock("../../shared/utilities/stock-trade", () => ({
  StockTradeUtil: {
    addGains: jest.fn().mockReturnValue(100),
    getEastCoastDate: jest.fn((date: Date) => date),
    getMinutesInDay: jest.fn(
      (date: Date) =>
        date.getHours() * CONSTANTS.MINS_IN_HOUR + date.getMinutes(),
    ),
    getMinutesInDayEastCoast: jest.fn(() => 959),
    getGains: jest.fn().mockReturnValue(100),
    getGainsNoPercent: jest.fn().mockReturnValue(2),
    periodisEligible: jest.fn(() => true),
  },
}));

describe("BackTest", () => {
  let backTest: BackTest;
  //const MockedGainsAnalyzer = jest.mocked(GainsAnalyzer);
  // MockedGainsAnalyzer.mockImplementation(() => {
  //     return {
  //         addGains: jest.fn().mockReturnValue(100) // Mock the addGains method
  //     };
  // });
  beforeEach(() => {
    backTest = new BackTest({
      id: 1,
      name: "",
      screeners: [
        {
          buySellFilters: {
            enter: { filters: [], connectors: [] },
            exit: { filters: [], connectors: [] },
          },
        },
      ],
      description: "",
      period: PeriodType.MINUTE,
    });
  });

  describe("run", () => {
    it("should close positions when time exceeds closeTime", () => {
      const datetime = new Date("2024-01-01T20:59:00Z").getTime(); // 3:59 PM EST (8:59 PM UTC)
      const mockStockData: IStockData[] = [
        {
          symbol: "AAPL",
          price: 150,
          tradePrice: 150,
          volume: 1000,
          datetime: datetime,
        },
        {
          symbol: "GOOGL",
          price: 2500,
          tradePrice: 2500,
          volume: 500,
          datetime: datetime,
        },
      ];

      // Create a position manually
      backTest["positions"]["AAPL"] = {
        price: 145,
        enterTime: datetime - 100000,
        screener: new Screener({} as IScreener),
        long: true,
        quantity: 10,
        timeSinceEntry: 5,
      };

      const closePositionsSpy = jest.spyOn(backTest, "closePositions");

      backTest.run(datetime, mockStockData);

      expect(closePositionsSpy).toHaveBeenCalled();
      closePositionsSpy.mockRestore();
    });

    it("should update position-specific filter data", () => {
      const datetime = new Date("2024-01-01T14:30:00Z").getTime(); // 9:30 AM EST (before closeTime)
      const mockStockData: IStockData[] = [
        {
          symbol: "AAPL",
          price: 150,
          tradePrice: 150,
          volume: 1000,
          datetime: datetime,
        },
        {
          symbol: "GOOGL",
          price: 2500,
          tradePrice: 2500,
          volume: 500,
          datetime: datetime,
        },
      ];

      const screener2 = new Screener({} as IScreener);

      backTest["positions"]["AAPL"] = {
        price: 145,
        enterTime: datetime - 100000,
        screener: screener2,
        long: true,
        quantity: 10,
        timeSinceEntry: 5,
      };

      backTest["positions"]["GOOGL"] = {
        price: 2500,
        enterTime: datetime - 200000,
        screener: screener2,
        long: true,
        quantity: 5,
        timeSinceEntry: 3,
      };

      // Mock the time calculation methods to return a time before closeTime
      (StockTradeUtil.getEastCoastDate as jest.Mock).mockImplementation(
        (date: Date) => {
          const estDate = new Date(
            date.toLocaleString("en-US", { timeZone: "America/New_York" }),
          );
          return estDate;
        },
      );
      (StockTradeUtil.getMinutesInDay as jest.Mock).mockImplementation(
        (date: Date) => {
          return date.getHours() * 60 + date.getMinutes(); // Return ~570 for 9:30 AM
        },
      );

      const updateDataSpy = jest.spyOn(
        backTest,
        "updatePositionSpecificFilterData",
      );

      backTest.run(datetime, mockStockData);

      expect(updateDataSpy).toHaveBeenCalled();
      updateDataSpy.mockRestore();
    });

    it("should process enter and exit actions", () => {
      const datetime = Date.now();
      const mockStockData: IStockData[] = [
        {
          symbol: "AAPL",
          price: 150,
          tradePrice: 150,
          volume: 1000,
          datetime: datetime,
        },
      ];

      backTest.run(datetime, mockStockData);
    });
  });

  describe("getTestResults", () => {
    it("should return test results", () => {
      const result = backTest.getTestResults();
      expect(result).toEqual({
        gains: [],
        total: 100,
        tradeNum: 0,
        avgTrade: Infinity,
        name: "",
      });
    });
  });

  describe("getTime", () => {
    it("should return the time in minutes after midnight", () => {
      const mockCandle: ICandle = {
        datetime: 0,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      };

      const result = backTest.getTime(mockCandle);
      expect(result).toEqual(959); // Mocked getMinutesInDayEastCoast return value
    });
  });

  describe("formatGains", () => {
    it("should format gains with correct gain percent", () => {
      const backTest = new BackTest({
        id: 1,
        name: "Test",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      });

      backTest["gains"] = [
        {
          symbol: "AAPL",
          gain: 1.05,
          time: new Date("2024-01-01T10:30:00Z").getTime(),
          atClose: false,
          enteredTime: new Date("2024-01-01T10:00:00Z").getTime(),
          highestGainPercent: 5,
          lowestLossPercent: -2,
          highestGainTime: 0,
          lowestLossTime: 0,
        },
      ];

      const result = backTest.formatGains();

      expect(result[0].symbol).toBe("AAPL");
      expect(result[0].gainPercent).toBe(5);
      expect(result[0].atClose).toBe(false);
      expect(result[0].time).toBe(new Date("2024-01-01T10:30:00Z").getTime());
      expect(result[0].enteredTime).toBe(
        new Date("2024-01-01T10:00:00Z").getTime(),
      );
      expect(result[0].timeFormatted).toBeDefined();
      expect(result[0].enteredTimeFormatted).toBeDefined();
    });

    it("should calculate negative gain percent correctly", () => {
      const backTest = new BackTest({
        id: 1,
        name: "Test",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      });

      backTest["gains"] = [
        {
          symbol: "MSFT",
          gain: 0.95,
          time: new Date("2024-01-01T14:00:00Z").getTime(),
          atClose: true,
          enteredTime: new Date("2024-01-01T13:30:00Z").getTime(),
          highestGainPercent: 2,
          lowestLossPercent: -5,
          highestGainTime: 0,
          lowestLossTime: 0,
        },
      ];

      const result = backTest.formatGains();

      expect(result[0].symbol).toBe("MSFT");
      expect(result[0].gainPercent).toBe(-5);
      expect(result[0].atClose).toBe(true);
    });

    it("should handle empty enteredTime", () => {
      const backTest = new BackTest({
        id: 1,
        name: "Test",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      });

      backTest["gains"] = [
        {
          symbol: "GOOG",
          gain: 1.1,
          time: new Date("2024-01-01T11:00:00Z").getTime(),
          atClose: false,
          enteredTime: undefined,
          highestGainPercent: 10,
          lowestLossPercent: 0,
          highestGainTime: 0,
          lowestLossTime: 0,
        },
      ];

      const result = backTest.formatGains();

      expect(result[0].enteredTimeFormatted).toBe("");
      expect(result[0].enteredTime).toBeUndefined();
    });

    it("should format multiple gains", () => {
      const backTest = new BackTest({
        id: 1,
        name: "Test",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      });

      backTest["gains"] = [
        {
          symbol: "AAPL",
          gain: 1.05,
          time: new Date("2024-01-01T10:30:00Z").getTime(),
          atClose: false,
          enteredTime: new Date("2024-01-01T10:00:00Z").getTime(),
          highestGainPercent: 5,
          lowestLossPercent: -2,
          highestGainTime: 0,
          lowestLossTime: 0,
        },
        {
          symbol: "MSFT",
          gain: 0.98,
          time: new Date("2024-01-01T14:00:00Z").getTime(),
          atClose: true,
          enteredTime: new Date("2024-01-01T13:30:00Z").getTime(),
          highestGainPercent: 2,
          lowestLossPercent: -2,
          highestGainTime: 0,
          lowestLossTime: 0,
        },
      ];

      const result = backTest.formatGains();

      expect(result.length).toBe(2);
      expect(result[0].gainPercent).toBe(5);
      expect(result[1].gainPercent).toBe(-2);
    });
  });
});
