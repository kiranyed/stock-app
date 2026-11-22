import { PeriodType } from "../../shared/constants";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";
import { EntryNotificationService } from "../../shared/services/entry-notification-service";
import { TradeLogger } from "../../shared/utilities/trade-logger";
import { IStrategy } from "../../types/strategy-types";
import { Screener } from "../../shared/classes/screener";

jest.mock("../../shared/utilities/trade-logger");
jest.mock("../../shared/services/repos/transaction-repository");
jest.mock("../../shared/services/entry-notification-service", () => ({
  EntryNotificationService: {
    sendEntryNotification: jest.fn(),
  },
}));

describe("StrategySimulation", () => {
  let strategySimulation: StrategySimulation;
  let strategy: IStrategy;
  const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
  const entryAction = {
    price: 150,
    orderType: "BUY",
    screener: {} as Screener,
    symbol: "AAPL",
    time: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = {
      id: 1,
      name: "Test Strategy",
      screeners: [],
      description: "Test Description",
      period: PeriodType.MINUTE,
    };
    strategySimulation = new StrategySimulation(strategy);
  });

  describe("constructor", () => {
    it("should initialize with the correct properties", () => {
      expect(strategySimulation.TRADE_SIZE).toBe(1);
      expect(strategySimulation.runId).toBe(0);
      expect(strategySimulation.id).toBe(0);
    });
  });

  describe("log", () => {
    it("should log a trade successfully", () => {
      //const action: IAction = {  symbol: 'AAPL', price: 150 , orderType: 'BUY', time: 1 };
      strategySimulation.log("test");

      expect(TradeLogger.logToStrategy).toHaveBeenCalledWith(
        "test",
        "Run0",
      );
    });

    it("should not send notifications by default on buy", async () => {
      (strategySimulation as unknown as { buy: (action: typeof entryAction) => void }).buy(entryAction);

      await flushPromises();

      expect(EntryNotificationService.sendEntryNotification).not.toHaveBeenCalled();
    });

    it("should send notifications on buy when notifyOnEntry is enabled", async () => {
      strategySimulation = new StrategySimulation(strategy, {
        notifyOnEntry: true,
      });

      (strategySimulation as unknown as { buy: (action: typeof entryAction) => void }).buy(entryAction);

      await flushPromises();

      expect(EntryNotificationService.sendEntryNotification).toHaveBeenCalledWith({
        orderType: "BUY",
        price: 150,
        strategyName: "Test Strategy",
        symbol: "AAPL",
        time: 1,
      });
    });

    it("should send notifications on sellShort when notifyOnEntry is enabled", async () => {
      strategySimulation = new StrategySimulation(strategy, {
        notifyOnEntry: true,
      });

      (strategySimulation as unknown as { sellShort: (action: typeof entryAction) => void }).sellShort({
        ...entryAction,
        orderType: "SELL_SHORT",
        symbol: "TSLA",
      });

      await flushPromises();

      expect(EntryNotificationService.sendEntryNotification).toHaveBeenCalledWith({
        orderType: "SELL_SHORT",
        price: 150,
        strategyName: "Test Strategy",
        symbol: "TSLA",
        time: 1,
      });
    });

    it("should log notification failures without blocking entry behavior", async () => {
      (EntryNotificationService.sendEntryNotification as jest.Mock).mockRejectedValueOnce(
        new Error("boom"),
      );
      strategySimulation = new StrategySimulation(strategy, {
        notifyOnEntry: true,
      });

      (strategySimulation as unknown as { buy: (action: typeof entryAction) => void }).buy(entryAction);

      await flushPromises();

      expect((strategySimulation as unknown as { positions: Record<string, unknown> }).positions.AAPL).toBeTruthy();
      expect(TradeLogger.logToStrategy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to send entry notification for AAPL"),
        "Run0",
      );
    });
  });
});
