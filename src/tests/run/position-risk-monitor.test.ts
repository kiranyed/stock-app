import { PositionRiskMonitor } from "../../run/position-risk-monitor";
import { SchwabAPI } from "../../shared/services/trading-api";
import PositionsRepository from "../../shared/services/repos/positions-repository";
import { TradeLogger } from "../../shared/utilities/trade-logger";
import { AccountType } from "../../shared/enums";
import { Twilio } from "twilio";

jest.mock("../../shared/services/trading-api", () => ({
  SchwabAPI: {
    getOptionsChains: jest.fn(),
    getStockDataMultiple: jest.fn(),
    getAccountPositions: jest.fn(),
    getOrder: jest.fn(),
    replaceOrder: jest.fn(),
    sellStock: jest.fn(),
    buyToCoverStock: jest.fn(),
    placeOrder: jest.fn(),
    cancelOrder: jest.fn(),
  },
}));

jest.mock("../../shared/services/repos/positions-repository", () => ({
  __esModule: true,
  default: {
    getActiveRulesByAccount: jest.fn(),
    deactivateRuleAfterExit: jest.fn(),
    deleteRule: jest.fn(),
  },
}));

jest.mock("../../shared/utilities/trade-logger", () => ({
  TradeLogger: {
    log: jest.fn(),
  },
}));

jest.mock("twilio", () => ({
  Twilio: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: "SM_TEST" }),
    },
  })),
}));

describe("PositionRiskMonitor", () => {
  const baseRule = {
    id: 101,
    symbol: "MSFT",
    target: 105,
    stop_loss: null,
    option: false,
    stop_loss_on_underlying: null,
    target_on_underlying: null,
  };

  const mockPosition = {
    instrument: { symbol: "MSFT" },
    longQuantity: 10,
    shortQuantity: 0,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    process.env.TWILIO_ACCOUNT_SID = "test_sid";
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    process.env.TWILIO_FROM_NUMBER = "+10000000000";
    process.env.NOTIFY_SMS_TO = "+10000000001";

    (PositionsRepository.getActiveRulesByAccount as jest.Mock).mockResolvedValue([
      baseRule,
    ]);
    (PositionsRepository.deleteRule as jest.Mock).mockResolvedValue(undefined);
    (PositionsRepository.deactivateRuleAfterExit as jest.Mock).mockResolvedValue(undefined);

    (SchwabAPI.getAccountPositions as jest.Mock).mockResolvedValue([mockPosition]);
    (SchwabAPI.sellStock as jest.Mock).mockResolvedValue("order-1");
    (TradeLogger.log as jest.Mock).mockImplementation(() => undefined);
  });

  afterEach(() => {
    const monitorClass = PositionRiskMonitor as unknown as {
      pendingExits: Map<string, unknown>;
      pendingExitMonitorInterval: NodeJS.Timeout | null;
      pendingExitTickInProgress: boolean;
    };

    if (monitorClass.pendingExitMonitorInterval) {
      clearInterval(monitorClass.pendingExitMonitorInterval);
      monitorClass.pendingExitMonitorInterval = null;
    }
    monitorClass.pendingExits.clear();
    monitorClass.pendingExitTickInProgress = false;

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("replaces pending target exits at 60% then 70% and alerts on third pending check", async () => {
    (SchwabAPI.getStockDataMultiple as jest.Mock)
      .mockResolvedValueOnce({
        MSFT: { quote: { bidPrice: 100, askPrice: 110, lastPrice: 110 } },
      })
      .mockResolvedValueOnce({
        MSFT: { quote: { bidPrice: 9, askPrice: 10, lastPrice: 9.5 } },
      })
      .mockResolvedValueOnce({
        MSFT: { quote: { bidPrice: 9.5, askPrice: 10.5, lastPrice: 10 } },
      });

    (SchwabAPI.getOrder as jest.Mock)
      .mockResolvedValueOnce({ status: "WORKING", quantity: 10, remainingQuantity: 6 })
      .mockResolvedValueOnce({ status: "WORKING", quantity: 10, remainingQuantity: 4 })
      .mockResolvedValueOnce({ status: "WORKING", quantity: 10, remainingQuantity: 4 });

    (SchwabAPI.replaceOrder as jest.Mock)
      .mockResolvedValueOnce("https://api/orders/order-2")
      .mockResolvedValueOnce("https://api/orders/order-3");

    await PositionRiskMonitor.runMonitorCycle(AccountType.TRADING);

    expect(SchwabAPI.sellStock).toHaveBeenCalledWith(
      "MSFT",
      106,
      10,
      true,
      AccountType.TRADING,
    );

    await jest.advanceTimersByTimeAsync(20000);
    await jest.advanceTimersByTimeAsync(20000);
    await jest.advanceTimersByTimeAsync(20000);

    expect(SchwabAPI.replaceOrder).toHaveBeenNthCalledWith(
      1,
      "order-1",
      "MSFT",
      9.6,
      "SELL",
      6,
      AccountType.TRADING,
    );

    expect(SchwabAPI.replaceOrder).toHaveBeenNthCalledWith(
      2,
      "order-2",
      "MSFT",
      10.2,
      "SELL",
      4,
      AccountType.TRADING,
    );

    const twilioCtor = Twilio as unknown as jest.Mock;
    expect(twilioCtor).toHaveBeenCalledTimes(1);
    const twilioInstance = twilioCtor.mock.results[0]?.value as {
      messages: { create: jest.Mock };
    };
    expect(twilioInstance.messages.create).toHaveBeenCalledTimes(1);

    expect(PositionsRepository.deactivateRuleAfterExit).not.toHaveBeenCalled();
  });

  it("deactivates the rule only after order fill", async () => {
    (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue({
      MSFT: { quote: { bidPrice: 100, askPrice: 110, lastPrice: 110 } },
    });

    (SchwabAPI.getOrder as jest.Mock).mockResolvedValue({
      status: "FILLED",
      quantity: 10,
      remainingQuantity: 0,
    });

    await PositionRiskMonitor.runMonitorCycle(AccountType.TRADING);
    await jest.advanceTimersByTimeAsync(20000);

    expect(PositionsRepository.deactivateRuleAfterExit).toHaveBeenCalledWith(101);
    expect(SchwabAPI.replaceOrder).not.toHaveBeenCalled();

    const monitorClass = PositionRiskMonitor as unknown as {
      pendingExits: Map<string, unknown>;
    };
    expect(monitorClass.pendingExits.size).toBe(0);
  });
});
