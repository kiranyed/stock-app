import { PeriodType } from "../../shared/constants";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";
import { AlertOutbox } from "../../notify/alert-outbox";
import TransactionRepository from "../../shared/services/repos/transaction-repository";
import { TradeLogger } from "../../shared/utilities/trade-logger";
import { IStrategy } from "../../types/strategy-types";
import { Screener } from "../../shared/classes/screener";

jest.mock("../../shared/utilities/trade-logger");
jest.mock("../../shared/services/repos/transaction-repository");
jest.mock("../../shared/services/repos/paper-position-repository");
jest.mock("../../providers/market-data", () => ({
  marketData: () => ({ capabilities: { displayPrices: true } }),
}));
jest.mock("../../notify/alert-outbox", () => ({
  AlertOutbox: { enqueue: jest.fn() },
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
      expect(strategySimulation.id).toBe(0);
    });
  });

  describe("closed trades", () => {
    // run id 0 was recorded before, which the repository refuses, so no simulated trade was stored
    it("are recorded under the run's id, long and short", () => {
      const sim = strategySimulation as unknown as {
        buy(a: typeof entryAction): void;
        sell(a: { symbol: string; price: number; orderType: string; time: number }): void;
        sellShort(a: typeof entryAction): void;
        buyToCover(a: { symbol: string; price: number; orderType: string; time: number }): void;
      };
      strategySimulation.setId(42);
      sim.buy(entryAction);
      sim.sell({ symbol: "AAPL", price: 165, orderType: "SELL", time: 2 });
      sim.sellShort({ ...entryAction, symbol: "TSLA", orderType: "SELL_SHORT" });
      sim.buyToCover({ symbol: "TSLA", price: 135, orderType: "BUY_TO_COVER", time: 2 });

      const calls = (TransactionRepository.recordTransactionSim as jest.Mock).mock.calls;
      expect(calls.map(([symbol, , , percent, long, runId]) => [symbol, Math.round(percent), long, runId])).toEqual([
        ["AAPL", 10, true, 42],
        ["TSLA", 10, false, 42],
      ]);
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

      expect(AlertOutbox.enqueue).not.toHaveBeenCalled();
    });

    it("should send notifications on buy when notifyOnEntry is enabled", async () => {
      strategySimulation = new StrategySimulation(strategy, {
        notifyOnEntry: true,
      });

      (strategySimulation as unknown as { buy: (action: typeof entryAction) => void }).buy(entryAction);

      await flushPromises();

      expect(AlertOutbox.enqueue).toHaveBeenCalledWith({
        kind: "entry",
        runId: 0,
        subject: "Test Strategy: entered long AAPL",
        body: expect.stringMatching(/^Test Strategy: entered long AAPL at 150\.00 \(12\/31\/1969, 7:00:00 PM ET\)$/),
        dedupKey: "entry:0:AAPL:BUY:1",
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

      expect(AlertOutbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Test Strategy: entered short TSLA", dedupKey: "entry:0:TSLA:SELL_SHORT:1" }),
      );
    });
  });
});
