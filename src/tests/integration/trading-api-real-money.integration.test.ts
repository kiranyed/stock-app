import * as dotenv from "dotenv";
import { AccountType } from "../../shared/enums";
import { SchwabAPI } from "../../shared/services/trading-api";

dotenv.config();

type MutationResult = {
  action:
    | "BUY"
    | "SELL"
    | "SELL_SHORT"
    | "BUY_TO_COVER"
    | "MARKET_BUY"
    | "MARKET_SELL";
  attempted: boolean;
  success: boolean;
  orderId?: string;
  httpStatus?: number;
  statusCode?: number;
  errorMessage?: string;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  const response = (error as { response?: { status?: number } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }

  const err = error as {
    message?: string;
    response?: { data?: unknown };
  };

  const responseData = err.response?.data;
  if (typeof responseData === "string") {
    return responseData;
  }

  if (typeof responseData === "object" && responseData !== null) {
    const data = responseData as {
      error?: string;
      error_description?: string;
      message?: string;
    };
    return (
      data.error_description ||
      data.message ||
      data.error ||
      JSON.stringify(responseData)
    );
  }

  return err.message || "Unknown Schwab API error";
};

describe("Integration - Trading API (RealMoneyStrategy surface)", () => {
  const runMutationTests = process.env.RUN_SCHWAB_MUTATION_TESTS === "true";
  const runMarketOrderTests = process.env.RUN_SCHWAB_MARKET_ORDER_TESTS === "true";
  const symbol = process.env.SCHWAB_TEST_SYMBOL || "OPEN";

  let schwabReady = false;

  beforeAll(async () => {
    try {
      await SchwabAPI.initialize();
      await SchwabAPI.testAccessToken();
      schwabReady = true;
    } catch {
      schwabReady = false;
    }
  }, 30000);

  it("validates read-only methods used by RealMoneyStrategy", async () => {
    if (!schwabReady) {
      console.warn("Skipping trading-api integration read-only test: Schwab auth unavailable.");
      return;
    }

    await SchwabAPI.resetAccessToken();
    await SchwabAPI.testAccessToken();

    const positions = await SchwabAPI.getAccountPositions(AccountType.REGULAR);
    expect(Array.isArray(positions)).toBe(true);

    const buyingPower = await SchwabAPI.getBuyingPower(AccountType.REGULAR);
    expect(typeof buyingPower).toBe("number");

    const single = await SchwabAPI.getStock(symbol);
    expect(single).toBeDefined();
    expect(single.symbol).toBe(symbol);
    expect(typeof single.quote.lastPrice).toBe("number");

    const multi = await SchwabAPI.getStockDataMultiple(symbol);
    expect(multi).toBeDefined();
    expect(multi[symbol]).toBeDefined();

    const pendingOrders = await SchwabAPI.getPendingOrders({ start: 1, end: 2 }, AccountType.REGULAR);
    expect(Array.isArray(pendingOrders)).toBe(true);

    if (pendingOrders.length > 0 && pendingOrders[0]?.orderId) {
      const order = await SchwabAPI.getOrder(String(pendingOrders[0].orderId), AccountType.REGULAR);
      expect(order).toBeDefined();
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const trades = await SchwabAPI.getTrades({
      start: yesterday.toISOString(),
      end: now.toISOString(),
    }, AccountType.REGULAR);
    expect(Array.isArray(trades)).toBe(true);
  }, 30000);

  it("runs guarded safe-price mutation checks on regular account", async () => {
    if (!runMutationTests) {
      console.warn("Skipping mutation checks. Set RUN_SCHWAB_MUTATION_TESTS=true to enable.");
      return;
    }

    if (!schwabReady) {
      console.warn("Skipping mutation checks: Schwab auth unavailable.");
      return;
    }

    const quote = await SchwabAPI.getStock(symbol);
    const marketPrice = quote?.quote?.lastPrice;
    expect(typeof marketPrice).toBe("number");
    if (typeof marketPrice !== "number") {
      return;
    }

    const safeBuyPrice = Number((marketPrice * 0.5).toFixed(2));
    const safeSellPrice = Number((marketPrice * 2).toFixed(2));

    const attempts: MutationResult[] = [];
    const callSpy = jest.spyOn(SchwabAPI, "callSchwabApi");

    const runAction = async (
      action: MutationResult["action"],
      place: () => Promise<string>,
    ) => {
      let orderId: string | undefined;
      const startCallCount = callSpy.mock.calls.length;
      try {
        orderId = await place();

        const newCalls = callSpy.mock.calls.slice(startCallCount);
        const orderCallOffset = newCalls.findIndex((call) => {
          const [url, method] = call;
          return (
            typeof url === "string" &&
            url.includes("/orders") &&
            method === "post"
          );
        });

        expect(orderCallOffset).toBeGreaterThanOrEqual(0);

        const orderResultIdx = startCallCount + orderCallOffset;
        const orderResp = await (callSpy.mock.results[orderResultIdx]
          ?.value as Promise<{ status?: number }>);

        expect(orderResp?.status).toBe(201);

        attempts.push({
          action,
          attempted: true,
          success: true,
          orderId,
          httpStatus: orderResp?.status,
        });
        await SchwabAPI.getOrder(orderId, AccountType.REGULAR);
      } catch (error) {
        const statusCode = getErrorStatus(error);
        const errorMessage = getErrorMessage(error);
        attempts.push({
          action,
          attempted: true,
          success: false,
          statusCode,
          errorMessage,
        });
        throw Object.assign(
          new Error(
            `Expected ${action} to succeed, but it failed with status ${statusCode ?? "unknown"}. Schwab error: ${errorMessage}`,
          ),
          { cause: error },
        );
      } finally {
        if (orderId) {
          try {
            await SchwabAPI.cancelOrder(orderId, AccountType.REGULAR);
          } catch {
            // If already filled/rejected/canceled, cancel can fail; ignore in cleanup.
          }
        }
      }
    };

    await runAction("BUY", () =>
      SchwabAPI.buyStock(symbol, safeBuyPrice, 1, true, AccountType.REGULAR),
    );

    await runAction("SELL", () =>
      SchwabAPI.sellStock(symbol, safeSellPrice, 1, true, AccountType.REGULAR),
    );

    await runAction("SELL_SHORT", () =>
      SchwabAPI.shortStock(symbol, safeSellPrice, 1, true, AccountType.REGULAR),
    );

    await runAction("BUY_TO_COVER", () =>
      SchwabAPI.buyToCoverStock(symbol, safeBuyPrice, 1, true, AccountType.REGULAR),
    );

    expect(attempts).toHaveLength(4);
    expect(attempts.every((item) => item.attempted)).toBe(true);
    expect(attempts.every((item) => item.success)).toBe(true);
    callSpy.mockRestore();

    console.log("Regular account mutation attempt summary", {
      symbol,
      marketPrice,
      safeBuyPrice,
      safeSellPrice,
      attempts,
    });
  }, 120000);

  it("runs explicitly opted-in market buy/sell checks on regular account", async () => {
    if (!runMarketOrderTests) {
      console.warn(
        "Skipping market order checks. Set RUN_SCHWAB_MARKET_ORDER_TESTS=true to enable.",
      );
      return;
    }

    if (!schwabReady) {
      console.warn("Skipping market order checks: Schwab auth unavailable.");
      return;
    }

    const attempts: MutationResult[] = [];
    const callSpy = jest.spyOn(SchwabAPI, "callSchwabApi");

    const runAction = async (
      action: Extract<MutationResult["action"], "MARKET_BUY" | "MARKET_SELL">,
      place: () => Promise<string>,
    ) => {
      let orderId: string | undefined;
      const startCallCount = callSpy.mock.calls.length;
      try {
        orderId = await place();

        const newCalls = callSpy.mock.calls.slice(startCallCount);
        const orderCallOffset = newCalls.findIndex((call) => {
          const [url, method] = call;
          return (
            typeof url === "string" &&
            url.includes("/orders") &&
            method === "post"
          );
        });

        expect(orderCallOffset).toBeGreaterThanOrEqual(0);

        const orderResultIdx = startCallCount + orderCallOffset;
        const orderResp = await (callSpy.mock.results[orderResultIdx]
          ?.value as Promise<{ status?: number }>);

        expect(orderResp?.status).toBe(201);

        attempts.push({
          action,
          attempted: true,
          success: true,
          orderId,
          httpStatus: orderResp?.status,
        });
        await SchwabAPI.getOrder(orderId, AccountType.REGULAR);
      } catch (error) {
        const statusCode = getErrorStatus(error);
        const errorMessage = getErrorMessage(error);
        attempts.push({
          action,
          attempted: true,
          success: false,
          statusCode,
          errorMessage,
        });
        throw Object.assign(
          new Error(
            `Expected ${action} to succeed, but it failed with status ${statusCode ?? "unknown"}. Schwab error: ${errorMessage}`,
          ),
          { cause: error },
        );
      } finally {
        if (orderId) {
          try {
            await SchwabAPI.cancelOrder(orderId, AccountType.REGULAR);
          } catch {
            // Market orders can fill immediately; cancel can fail during cleanup.
          }
        }
      }
    };

    await runAction("MARKET_BUY", () =>
      SchwabAPI.buyStock(symbol, 1, 1, false, AccountType.REGULAR),
    );

    await runAction("MARKET_SELL", () =>
      SchwabAPI.sellStock(symbol, 0, 1, false, AccountType.REGULAR),
    );

    expect(attempts).toHaveLength(2);
    expect(attempts.every((item) => item.attempted)).toBe(true);
    expect(attempts.every((item) => item.success)).toBe(true);
    callSpy.mockRestore();

    console.log("Regular account market order attempt summary", {
      symbol,
      attempts,
    });
  }, 120000);

  it("runs explicitly opted-in raw MARKET body check with price included", async () => {
    if (!runMarketOrderTests) {
      console.warn(
        "Skipping raw MARKET body check. Set RUN_SCHWAB_MARKET_ORDER_TESTS=true to enable.",
      );
      return;
    }

    if (!schwabReady) {
      console.warn("Skipping raw MARKET body check: Schwab auth unavailable.");
      return;
    }

    const accountHash = process.env.REGULAR_ACCOUNT_HASH;
    expect(accountHash).toBeDefined();
    if (!accountHash) {
      return;
    }

    const payload = {
      orderType: "MARKET",
      session: "NORMAL",
      duration: "DAY",
      orderStrategyType: "SINGLE",
      price: "3.6",
      orderLegCollection: [
        {
          instruction: "BUY",
          quantity: 278,
          instrument: {
            symbol: "EMBC",
            assetType: "EQUITY",
          },
        },
      ],
    };

    try {
      const response = await SchwabAPI.callSchwabApi(
        `https://api.schwabapi.com/trader/v1/accounts/${accountHash}/orders`,
        "post",
        undefined,
        undefined,
        payload,
      );

      throw new Error(
        `Expected raw MARKET body with price to fail, but Schwab returned status ${response?.status}.`,
      );
    } catch (error) {
      const statusCode = getErrorStatus(error);
      const errorMessage = getErrorMessage(error);

      expect(statusCode).toBe(400);
      console.log("Raw MARKET body rejection", {
        statusCode,
        errorMessage,
      });
    }
  }, 120000);
});
