import { IStrategy } from "../../../types/strategy-types";
import { IStockData } from "../../../types/data-processing-types";
import { StrategySimulation } from "../../../real-time-trading/strategy-simulation";
import { PeriodType } from "../../../shared/constants";
import TransactionRepository from "../../../shared/services/repos/transaction-repository";
import { TradeLogger } from "../../../shared/utilities/trade-logger";
import { StockTradeUtil } from "../../../shared/utilities/stock-trade";

jest.mock("../../../shared/services/repos/transaction-repository");
jest.mock("../../../shared/utilities/trade-logger");
jest.mock("../../../shared/classes/screener", () => ({
  Screener: jest.fn().mockImplementation(() => ({
    runSellFilters: jest.fn().mockReturnValue(false),
    runBuyFilters: jest.fn().mockReturnValue(true),
    getVariables: jest
      .fn()
      .mockReturnValue([
        { name: "percentchange3", spec: { kind: "percentChange", bars: 3 } },
        { name: "percentGain" },
        { name: "timeSinceEntry" },
      ]),
    hasFlags: jest.fn().mockReturnValue(false),
    hasBuySellFilters: jest.fn().mockReturnValue(true),
    hasShortCoverFilters: jest.fn().mockReturnValue(false),
  })),
}));

describe("StrategyRun", () => {
  let strategyRun: StrategySimulation;
  let mockStrategy: IStrategy;
  const date = new Date("Monday March 24, 2020 9:30:00");
  const datetime = date.getTime();
  beforeAll(() => {
    mockStrategy = {
      id: 1,
      screeners: [
        {
          buySellFilters: {
            enter: {
              filters: [
                {
                  varName: "percentchange",
                  compareVal: "3",
                  operator: ">",
                  timeAgo: "3",
                },
              ],
              connectors: ["AND"],
            },
            exit: {
              filters: [
                { varName: "percentGain", compareVal: "2", operator: ">" },
              ],
              connectors: ["AND"],
            },
          },
        },
      ],
      description: "",
      name: "",
      period: PeriodType.MINUTE,
    };
    strategyRun = new StrategySimulation(mockStrategy);
    TransactionRepository.recordTransactionSim = jest.fn();
    TradeLogger.logToStrategy = jest.fn();
  });

  describe("constructor", () => {
    it("should initialize the strategy and screener", () => {
      expect(strategyRun.getStrategy()).toEqual(mockStrategy);
    });
  });

  describe("getVariables", () => {
    it("should return all variables", () => {
      const result = strategyRun.getVariables().map((v) => v.name);
      expect(result).toEqual([
        "percentchange3",
        "percentGain",
        "timeSinceEntry",
      ]);
    });
  });

  describe("isCleared", () => {
    it("should return true if the strategy is cleared", () => {
      const result = strategyRun.isCleared();
      expect(result).toBe(true);
    });
  });

  describe("run", () => {
    it("should run the strategy and update positions", () => {
      strategyRun.setVars({ percentchange3: { AAPL: 3.5 } });
      strategyRun.run(datetime, [
        { volume: 0, symbol: "AAPL", price: 1, tradePrice: 1.2, datetime },
      ]);
      expect(strategyRun.isCleared()).toBe(false);
    });

    it("should close positions and return early for 30-minute period when ecm >= closeTime", () => {
      const halfHourStrategy: IStrategy = {
        id: 4,
        screeners: [
          {
            buySellFilters: {
              enter: {
                filters: [
                  {
                    varName: "percentchange",
                    compareVal: "3",
                    operator: ">",
                    timeAgo: "3",
                  },
                ],
                connectors: ["AND"],
              },
              exit: {
                filters: [
                  { varName: "percentGain", compareVal: "2", operator: ">" },
                ],
                connectors: ["AND"],
              },
            },
          },
        ],
        description: "",
        name: "half-hour strategy",
        period: 30,
      };
      const halfHourRun = new StrategySimulation(halfHourStrategy);
      const periodEligibleSpy = jest
        .spyOn(StockTradeUtil, "periodisEligible")
        .mockReturnValue(true);

      halfHourRun.setVars({ percentchange3: { AAPL: 3.5 } });
      halfHourRun.run(datetime, [
        { volume: 0, symbol: "AAPL", price: 1, tradePrice: 1.2, datetime },
      ]);

      const closePositionsSpy = jest.spyOn(halfHourRun, "closePositions");
      const updateDataSpy = jest.spyOn(
        halfHourRun,
        "updatePositionSpecificFilterData",
      );
      const getEastCoastDateSpy = jest
        .spyOn(StockTradeUtil, "getEastCoastDate")
        .mockReturnValue(new Date("2024-01-01T15:30:00"));
      const getMinutesInDaySpy = jest
        .spyOn(StockTradeUtil, "getMinutesInDay")
        .mockReturnValue(930);

      halfHourRun.run(datetime + 60000, [
        {
          volume: 0,
          symbol: "AAPL",
          price: 1.05,
          tradePrice: 1.05,
          datetime: datetime + 60000,
        },
      ]);

      expect(getMinutesInDaySpy).toHaveBeenCalled();
      expect(closePositionsSpy).toHaveBeenCalled();
      expect(updateDataSpy).not.toHaveBeenCalled();

      closePositionsSpy.mockRestore();
      updateDataSpy.mockRestore();
      getEastCoastDateSpy.mockRestore();
      getMinutesInDaySpy.mockRestore();
      periodEligibleSpy.mockRestore();
    });

    it("should use raw east coast minutes for daily period (do not subtract BEGIN_TIME)", () => {
      const dailyStrategy: IStrategy = {
        id: 3,
        screeners: [
          {
            buySellFilters: {
              enter: {
                filters: [
                  {
                    varName: "percentchange",
                    compareVal: "3",
                    operator: ">",
                    timeAgo: "3",
                  },
                ],
                connectors: ["AND"],
              },
              exit: {
                filters: [
                  { varName: "percentGain", compareVal: "2", operator: ">" },
                ],
                connectors: ["AND"],
              },
            },
          },
        ],
        description: "",
        name: "daily strategy",
        period: PeriodType.DAY,
      };
      const dailyRun = new StrategySimulation(dailyStrategy);

      const mockEastCoastDate = new Date("2024-01-01T09:30:00");
      const getEastCoastDateSpy = jest
        .spyOn(StockTradeUtil, "getEastCoastDate")
        .mockReturnValue(mockEastCoastDate);
      const getMinutesInDaySpy = jest
        .spyOn(StockTradeUtil, "getMinutesInDay")
        .mockReturnValue(570);
      const periodEligibleSpy = jest
        .spyOn(StockTradeUtil, "periodisEligible")
        .mockReturnValue(true);

      dailyRun.setVars({ percentchange3: { AAPL: 3.5 } });
      dailyRun.run(datetime, [
        { volume: 0, symbol: "AAPL", price: 1, tradePrice: 1.2, datetime },
      ]);

      expect(getEastCoastDateSpy).toHaveBeenCalledWith(new Date(datetime));
      expect(getMinutesInDaySpy).toHaveBeenCalledWith(mockEastCoastDate);
      expect(periodEligibleSpy).toHaveBeenCalledWith(570, PeriodType.DAY, true);

      getEastCoastDateSpy.mockRestore();
      getMinutesInDaySpy.mockRestore();
      periodEligibleSpy.mockRestore();
    });
  });

  describe("strategySpecificCalculations", () => {
    it("should perform strategy specific calculations", () => {
      const mockData = { AAPL: 2 };
      const result = strategyRun.strategySpecificCalculations(
        mockData,
        "percentGain",
        "AAPL",
      );
      expect(result).toEqual(100 * (2 / 1.2 - 1));
    });
  });

  describe("updatePositionSpecificFilterData", () => {
    it("should update position specific filter data", () => {
      const mockData: IStockData[] = [
        { volume: 0, symbol: "AAPL", price: 2, tradePrice: 2.2, datetime },
      ];
      strategyRun.updatePositionSpecificFilterData(mockData, 1);
      expect(strategyRun.getVars()).toEqual({
        percentchange3: { AAPL: 3.5 },
        percentGain: { AAPL: 100 * (2.2 / 1.2 - 1) },
        timeSinceEntry: { AAPL: 1 },
      });
    });

    it("should increment timeSinceEntry for each position when variable is timeSinceEntry", () => {
      // Create a strategy with timeSinceEntry in the exit filters
      const strategyWithTime: IStrategy = {
        id: 2,
        screeners: [
          {
            buySellFilters: {
              enter: {
                filters: [
                  {
                    varName: "percentchange",
                    compareVal: "3",
                    operator: ">",
                    timeAgo: "3",
                  },
                ],
                connectors: ["AND"],
              },
              exit: {
                filters: [
                  { varName: "timeSinceEntry", compareVal: "5", operator: ">" },
                ],
                connectors: ["AND"],
              },
            },
          },
        ],
        description: "",
        name: "",
        period: PeriodType.MINUTE,
      };
      const strategyRunWithTime = new StrategySimulation(strategyWithTime);

      // Set up initial vars and position
      strategyRunWithTime.setVars({ percentchange3: { AAPL: 3.5 } });
      strategyRunWithTime.run(datetime, [
        { volume: 0, symbol: "AAPL", price: 1, datetime, tradePrice: 1.1 },
      ]);

      // Update position specific data
      const mockData: IStockData[] = [
        { volume: 0, symbol: "AAPL", price: 2, datetime },
      ];
      strategyRunWithTime.updatePositionSpecificFilterData(
        mockData,
        datetime + 60000,
      );

      // timeSinceEntry should be incremented from 0 to 1
      expect(strategyRunWithTime.getVars().timeSinceEntry.AAPL).toBe(1);

      // Call again to verify it increments
      strategyRunWithTime.updatePositionSpecificFilterData(
        mockData,
        datetime + 120000,
      );
      expect(strategyRunWithTime.getVars().timeSinceEntry.AAPL).toBe(2);
    });
  });

  describe("closePositions", () => {
    it("should close all positions", () => {
      strategyRun.closePositions(
        [{ volume: 0, symbol: "AAPL", price: 1, tradePrice: 2.1, datetime: 3 }],
        1,
      );
      expect(strategyRun.isCleared()).toBe(true);
    });
  });

  describe("calculateGain", () => {
    it("should calculate the gain for a position", () => {
      const result = strategyRun.calculateGain(100, 105, true);
      expect(result).toBe(1.05);
    });
  });
});
