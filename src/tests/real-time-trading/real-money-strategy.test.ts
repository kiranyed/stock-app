import { PeriodType } from "../../shared/constants";
import { RealMoneyStrategy } from "../../real-time-trading/real-money-strategy";
import { SchwabAPI } from "../../shared/services/trading-api";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";
import { TradeLogger } from "../../shared/utilities/trade-logger";
import TransactionRepository from "../../shared/services/repos/transaction-repository";
import { IAction, IStrategy } from "../../types/strategy-types";

jest.mock("../../shared/services/trading-api", () => ({
  SchwabAPI: {
    getAccountPositions: jest.fn(),
    getStockDataMultiple: jest.fn(),
    getTrades: jest.fn(),
    getBuyingPower: jest.fn(),
    getPendingOrders: jest.fn(),
    cancelOrder: jest.fn(),
    resetAccessToken: jest.fn(),
    testAccessToken: jest.fn(),
    sellStock: jest.fn(),
    buyStock: jest.fn(),
    shortStock: jest.fn(),
    buyToCoverStock: jest.fn(),
  },
}));

jest.mock("../../shared/utilities/stock-trade", () => ({
  StockTradeUtil: {
    getMinutesInDayEastCoast: jest.fn(() => 0),
    getEastCoastDate: jest.fn(() => new Date("2026-01-01T10:00:00.000Z")),
  },
}));

jest.mock("../../shared/utilities/trade-logger", () => ({
  TradeLogger: {
    logToStrategy: jest.fn(),
    logError: jest.fn(),
    initializeStrategyLog: jest.fn(),
  },
}));

jest.mock("../../shared/services/repos/transaction-repository", () => ({
  __esModule: true,
  default: {
    recordTransaction: jest.fn(),
    recordTransactionSim: jest.fn(),
    updateTransaction: jest.fn(),
  },
}));

jest.mock("../../shared/classes/screener");

describe("RealMoneyStrategy", () => {
  let strategy: IStrategy;
  let realMoneyStrategy: RealMoneyStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    (SchwabAPI.getAccountPositions as jest.Mock).mockResolvedValue([]);
    (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue({});
    (SchwabAPI.getTrades as jest.Mock).mockResolvedValue([]);
    (SchwabAPI.getBuyingPower as jest.Mock).mockResolvedValue(10000);
    (SchwabAPI.getPendingOrders as jest.Mock).mockResolvedValue([]);
    (SchwabAPI.cancelOrder as jest.Mock).mockResolvedValue(undefined);
    (SchwabAPI.resetAccessToken as jest.Mock).mockResolvedValue(undefined);
    (SchwabAPI.testAccessToken as jest.Mock).mockResolvedValue(undefined);
    (SchwabAPI.sellStock as jest.Mock).mockResolvedValue("https://test/orders/1");
    (SchwabAPI.buyStock as jest.Mock).mockResolvedValue("https://test/orders/1");
    (SchwabAPI.shortStock as jest.Mock).mockResolvedValue("https://test/orders/2");
    (SchwabAPI.buyToCoverStock as jest.Mock).mockResolvedValue(
      "https://test/orders/3",
    );
    strategy = {
      id: 1,
      name: "Test Strategy",
      screeners: [],
      description: "",
      period: PeriodType.DAY,
    };
    realMoneyStrategy = new RealMoneyStrategy(strategy);
  });

  describe("logTrade", () => {
    it("logs the action payload", () => {
      const action: IAction = {
        orderType: "BUY",
        symbol: "AAPL",
        price: 150,
        time: 100,
      };

      realMoneyStrategy.logTrade(action);

      expect(TradeLogger.logToStrategy).toHaveBeenCalledWith(
        "Trade made: " + JSON.stringify(action),
        "Test Strategy",
      );
    });
  });

  describe("updateTransaction", () => {
    it("logs transaction payload and returns undefined", () => {
      const transaction = { id: 1, symbol: "AAPL", quantity: 10, price: 150 };

      const result = realMoneyStrategy.updateTransaction(transaction);

      expect(TradeLogger.logToStrategy).toHaveBeenCalledWith(
        "Transaction made: " + JSON.stringify(transaction),
        "Test Strategy",
      );
      expect(result).toBeUndefined();
    });
  });

  describe("constructor", () => {
    it("initializes existing positions from account holdings", async () => {
      (SchwabAPI.getAccountPositions as jest.Mock).mockResolvedValueOnce([
        {
          instrument: { symbol: "AAPL" },
          longQuantity: 5,
          shortQuantity: 0,
        },
        {
          instrument: { symbol: "TSLA" },
          longQuantity: 0,
          shortQuantity: 3,
        },
      ]);

      const realMoneyStrategy = new RealMoneyStrategy(strategy);

      await Promise.resolve();
      await Promise.resolve();

      expect(realMoneyStrategy.existingPositions).toEqual({ AAPL: 5, TSLA: 3 });
      expect(TradeLogger.logToStrategy).toHaveBeenCalledWith(
        "initialized existing positions: 2",
        "Run0",
      );
    });
  });

  describe("helpers", () => {
    it("returns parsed order id from location", () => {
      expect(realMoneyStrategy.parseForOrder("https://x/orders/abc123")).toBe(
        "abc123",
      );
    });

    it("delegates minutesInDay to StockTradeUtil", () => {
      (StockTradeUtil.getMinutesInDayEastCoast as jest.Mock).mockReturnValue(555);

      expect(realMoneyStrategy.minutesInDay).toBe(555);
      expect(StockTradeUtil.getMinutesInDayEastCoast).toHaveBeenCalled();
    });
  });

  describe("recordPositionReal", () => {
    it("records real transaction with expected values", () => {
      realMoneyStrategy.setId(42);

      realMoneyStrategy.recordPositionReal("AAPL", 123.45, 4.2, true);

      expect(TransactionRepository.recordTransaction).toHaveBeenCalledWith(
        "AAPL",
        new Date("2026-01-01T10:00:00.000Z").getTime(),
        123.45,
        4.2,
        true,
        42,
      );
    });

    it("throws when symbol is empty", () => {
      expect(() =>
        realMoneyStrategy.recordPositionReal("", 10, 1.2, false),
      ).toThrow("Unknown symbol");
    });
  });

  describe("closeUnexpectedPositions", () => {
    it("sells longs and covers shorts", async () => {
      (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue({
        AAPL: { quote: { lastPrice: 100 } },
        TSLA: { quote: { lastPrice: 200 } },
      });

      realMoneyStrategy.closeUnexpectedPositions({
        AAPL: { amount: 3, cost: 0 },
        TSLA: { amount: -2, cost: 0 },
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(SchwabAPI.sellStock).toHaveBeenCalledWith("AAPL", 100, 3);
      expect(SchwabAPI.buyToCoverStock).toHaveBeenCalledWith("TSLA", 200, 2);
    });
  });

  describe("calculateTransactions", () => {
    it("records matched close trades", async () => {
      const recordSpy = jest.spyOn(realMoneyStrategy, "recordPositionReal");
      (SchwabAPI.getTrades as jest.Mock).mockResolvedValue([
        {
          type: "TRADE",
          description: "SELL TRADE",
          transactionItem: {
            instrument: { symbol: "AAPL" },
            amount: 1,
            cost: 120,
          },
        },
        {
          type: "TRADE",
          description: "BUY TRADE",
          transactionItem: {
            instrument: { symbol: "AAPL" },
            amount: 1,
            cost: -100,
          },
        },
      ]);

      await realMoneyStrategy.calculateTransactions();

      expect(recordSpy).toHaveBeenCalledWith("AAPL", 20, expect.any(Number), true);
    });

    it("logs when close trade has no matching open", async () => {
      (SchwabAPI.getTrades as jest.Mock).mockResolvedValue([
        {
          type: "TRADE",
          description: "SELL TRADE",
          transactionItem: {
            instrument: { symbol: "MSFT" },
            amount: 1,
            cost: 200,
          },
        },
      ]);

      await realMoneyStrategy.calculateTransactions();

      expect(TradeLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining(
          "No matching open position when calculating transactions for MSFT",
        ),
        "Run0",
      );
    });
  });

  describe("order helpers", () => {
    it("creates buy and short orders via doEnterMarket", async () => {
      const buyAction: IAction = {
        orderType: "BUY",
        symbol: "AAPL",
        price: 100,
        time: 1,
      };
      const shortAction: IAction = {
        orderType: "SELL_SHORT",
        symbol: "TSLA",
        price: 200,
        time: 1,
      };

      const buyId = await realMoneyStrategy.doEnterMarket(buyAction);
      const shortId = await realMoneyStrategy.doEnterMarket(shortAction);

      expect(buyId).toBe("1");
      expect(shortId).toBe("2");
      expect(SchwabAPI.buyStock).toHaveBeenCalled();
      expect(SchwabAPI.shortStock).toHaveBeenCalled();
    });

    it("creates sell and buy-to-cover orders via doExitMarket", async () => {
      (realMoneyStrategy as unknown as { positions: Record<string, { quantity: number }> }).positions = {
        AAPL: { quantity: 5 },
        TSLA: { quantity: 7 },
      };

      const sellAction: IAction = {
        orderType: "SELL",
        symbol: "AAPL",
        price: 100,
        time: 1,
      };
      const coverAction: IAction = {
        orderType: "BUY_TO_COVER",
        symbol: "TSLA",
        price: 200,
        time: 1,
      };

      const sellId = await realMoneyStrategy.doExitMarket(sellAction);
      const coverId = await realMoneyStrategy.doExitMarket(coverAction);

      expect(sellId).toBe("1");
      expect(coverId).toBe("3");
      expect(SchwabAPI.sellStock).toHaveBeenCalled();
      expect(SchwabAPI.buyToCoverStock).toHaveBeenCalled();
    });
  });

  describe("syncPositions", () => {
    it("collects unexpected positions and passes them to closeUnexpectedPositions", async () => {
      const closeSpy = jest.spyOn(realMoneyStrategy, "closeUnexpectedPositions");
      (SchwabAPI.getAccountPositions as jest.Mock).mockResolvedValueOnce([
        {
          instrument: { symbol: "NFLX" },
          longQuantity: 4,
          shortQuantity: 0,
        },
      ]);

      await realMoneyStrategy.syncPositions(123);

      expect(closeSpy).toHaveBeenCalledWith({
        NFLX: { amount: 4, cost: 0 },
      });
    });
  });

  describe("doEnter/doExit", () => {
    it("calls verifyOrderDone for doEnter BUY path", async () => {
      const verifySpy = jest
        .spyOn(realMoneyStrategy, "verifyOrderDone")
        .mockResolvedValue(undefined);

      await realMoneyStrategy.doEnter({
        orderType: "BUY",
        symbol: "AAPL",
        price: 100,
        time: 10,
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(SchwabAPI.buyStock).toHaveBeenCalled();
      expect(verifySpy).toHaveBeenCalled();
    });

    it("calls verifyOrderDone for doExit SELL path", async () => {
      const verifySpy = jest
        .spyOn(realMoneyStrategy, "verifyOrderDone")
        .mockResolvedValue(undefined);
      (realMoneyStrategy as unknown as { positions: Record<string, { quantity: number }> }).positions = {
        AAPL: { quantity: 2 },
      };

      await realMoneyStrategy.doExit({
        orderType: "SELL",
        symbol: "AAPL",
        price: 100,
        time: 10,
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(SchwabAPI.sellStock).toHaveBeenCalled();
      expect(verifySpy).toHaveBeenCalled();
    });
  });

  describe("prepareForRun", () => {
    it("sets started and clears IDsToCancel on success", async () => {
      const syncSpy = jest
        .spyOn(realMoneyStrategy, "syncPositions")
        .mockResolvedValue(undefined);
      const cancelSpy = jest
        .spyOn(realMoneyStrategy, "cancelOrders")
        .mockResolvedValue(undefined);
      realMoneyStrategy.IDsToCancel = ["x", "y"];

      await realMoneyStrategy.prepareForRun();

      expect(SchwabAPI.getBuyingPower).toHaveBeenCalled();
      expect(syncSpy).toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalledWith(["x", "y"]);
      expect(realMoneyStrategy.IDsToCancel).toEqual([]);
      expect((realMoneyStrategy as unknown as { started: boolean }).started).toBe(
        true,
      );
    });

  });

  describe("cancel helpers", () => {
    it("cancelOrders removes matching pending enter/exit actions", async () => {
      (SchwabAPI.getPendingOrders as jest.Mock).mockResolvedValueOnce([
        {
          orderId: "id-enter",
          orderLegCollection: [
            { instruction: "BUY", instrument: { symbol: "AAPL" } },
          ],
        },
        {
          orderId: "id-exit",
          orderLegCollection: [
            { instruction: "SELL", instrument: { symbol: "TSLA" } },
          ],
        },
      ]);
      (realMoneyStrategy as unknown as {
        pendingEnterActions: Record<string, unknown>;
        pendingExitActions: Record<string, unknown>;
      }).pendingEnterActions = { AAPL: { x: 1 } };
      (realMoneyStrategy as unknown as {
        pendingEnterActions: Record<string, unknown>;
        pendingExitActions: Record<string, unknown>;
      }).pendingExitActions = { TSLA: { x: 1 } };

      await realMoneyStrategy.cancelOrders(["id-enter", "id-exit"]);

      expect(SchwabAPI.cancelOrder).toHaveBeenCalledWith("id-enter");
      expect(SchwabAPI.cancelOrder).toHaveBeenCalledWith("id-exit");
      expect(
        (realMoneyStrategy as unknown as {
          pendingEnterActions: Record<string, unknown>;
        }).pendingEnterActions.AAPL,
      ).toBeUndefined();
      expect(
        (realMoneyStrategy as unknown as {
          pendingExitActions: Record<string, unknown>;
        }).pendingExitActions.TSLA,
      ).toBeUndefined();
    });

    it("cancelOldPendingOrders cancels stale orders", async () => {
      const oldTime = Date.now() - 10 * 60 * 1000;
      (SchwabAPI.getPendingOrders as jest.Mock).mockResolvedValueOnce([
        {
          orderId: "old-1",
          enteredTime: oldTime,
          orderLegCollection: [
            { instruction: "BUY", instrument: { symbol: "AAPL" } },
          ],
        },
      ]);
      (realMoneyStrategy as unknown as {
        pendingEnterActions: Record<string, unknown>;
      }).pendingEnterActions = { AAPL: { x: 1 } };

      await realMoneyStrategy.cancelOldPendingOrders();

      expect(SchwabAPI.cancelOrder).toHaveBeenCalledWith("old-1");
      expect(
        (realMoneyStrategy as unknown as {
          pendingEnterActions: Record<string, unknown>;
        }).pendingEnterActions.AAPL,
      ).toBeUndefined();
    });
  });

  describe("doAllOrders", () => {
    it("resolves collected order ids from enter and exit actions", async () => {
      jest.useFakeTimers();
      jest
        .spyOn(realMoneyStrategy, "doEnterMarket")
        .mockResolvedValueOnce("enter-id");
      jest
        .spyOn(realMoneyStrategy, "doExitMarket")
        .mockResolvedValueOnce("exit-id");

      const result = await realMoneyStrategy.doAllOrders([
        { orderType: "BUY", symbol: "AAPL", price: 100, time: 1 },
        { orderType: "SELL", symbol: "AAPL", price: 101, time: 2 },
      ]);

      expect(result).toEqual(["enter-id", "exit-id"]);
      jest.clearAllTimers();
      jest.useRealTimers();
    });
  });
});
