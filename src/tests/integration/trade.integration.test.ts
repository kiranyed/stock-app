import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { IOrderData } from "../../types/external-data-types";
import { AccountType } from "../../shared/enums";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const GET = "get";
const POST = "post";
const DELETE = "delete";

describe("Integration - Trade", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";
  const timeTestStarted = new Date();

  const username = `tradeuser${Date.now()}`;
  const password = "Passw0rd9";

  const payload = {
    symbol: "BTU",
    orderType: "BUY",
    marketOrder: false,
    price: 10,
    shares: 1,
  };

  const optionsBody = {
    symbol: "AAPL",
    weeklies: ["atm"],
    dollars: 100000,
    quantity: 10,
    price: 5,
    accountType: AccountType.TRADING,
  };

  const request = (url: string, method: string, body?: string | object) => {
    switch (method) {
      case GET:
        return agent.get(url).set("x-access-token", userToken);
      case POST:
        return agent.post(url).set("x-access-token", userToken).send(body);
      case DELETE:
        return agent.delete(url).set("x-access-token", userToken);
      default:
        return agent.get(url);
    }
  };

  const targetSymbols = ["BTU", "AAPL"];

  type OrderLike = IOrderData & {
    symbol?: string;
    underlyingSymbol?: string;
    instrument?: { symbol?: string };
  };

  const extractSymbol = (order: OrderLike) =>
    order.symbol || order.underlyingSymbol || order.instrument?.symbol || "";

  const filterTargetOrders = (orders: IOrderData[]) =>
    orders.filter((order) => targetSymbols.includes(extractSymbol(order)));

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    dotenv.config();
    const appServer = new AppServer();
    agent = supertest.agent(appServer.getExpressInstance());
    await SchwabAPI.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();

    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);
    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    userToken = login.body.token;
    expect(userToken).toBeTruthy();
  });

  it("makes an order", async () => {
    const res = await request("/api/trade/make-orders", POST, {
      orders: [payload],
      accountType: AccountType.TRADING,
    });
    expect(res.status).toBe(201);
  }, 10000);

  it("checks account positions", async () => {
    const res = await request(
      "/api/trade/acct-positions?accountType=trading",
      GET,
    );
    expect(res.status).toBe(200);
  }, 10000);

  it("makes an options order", async () => {
    const res = await request("/api/trade/options-trade", POST, {
      ...optionsBody,
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Placed 1 options order(s)");
  }, 10000);

  it("cancels recent orders", async () => {
    const startTime = timeTestStarted.getTime();
    const endTime = Date.now();
    const res1 = await request(
      `/api/trade/orders?accountType=trading&startTime=${startTime}&endTime=${endTime}`,
      GET,
    );

    expect(res1.status).toBe(200);
    const orders = filterTargetOrders(res1.body.orders);
    const cancelableOrders = orders.filter(
      (order: IOrderData) =>
        order.cancelable &&
        order.status !== "CANCELED" &&
        order.status !== "REJECTED",
    );

    for (const order of cancelableOrders) {
      await request(`/api/trade/cancel-order?orderId=${order.orderId}`, DELETE);
    }

    let remainingCancelable = cancelableOrders.length;
    for (let attempt = 0; attempt < 5 && remainingCancelable > 0; attempt++) {
      await wait(1000);
      const res3 = await request(
        `/api/trade/orders?accountType=trading&startTime=${startTime}&endTime=${endTime}`,
        GET,
      );
      const tradingAccountOrders2 = filterTargetOrders(res3.body.orders);
      const orders2 = tradingAccountOrders2
      remainingCancelable = orders2.filter(
        (order: IOrderData) => order.cancelable,
      ).length;
      if (remainingCancelable === 0) break;
    }

    expect(remainingCancelable).toBe(0);
  }, 15000);


  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
