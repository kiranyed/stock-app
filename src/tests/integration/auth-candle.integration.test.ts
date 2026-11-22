import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { ICandle } from "../../types/back-test-types";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const candleDataQuery =
  "?symbols=AAPL&startTime=1594011600000&endTime=1596430800000&frequencyMinutes=1440&useClose=true";
const expectedCandleData = [
  {
    symbol: "AAPL",
    postEarningsGain: 0,
    candles: [
      { price: 93.4625, time: 0 },
      { price: 93.1725, time: 1 },
      { price: 95.3425, time: 2 },
      { price: 95.6825, time: 3 },
      { price: 95.92, time: 4 },
      { price: 95.4775, time: 7 },
      { price: 97.0575, time: 8 },
      { price: 97.725, time: 9 },
      { price: 96.5225, time: 10 },
      { price: 96.3275, time: 11 },
      { price: 98.3575, time: 14 },
      { price: 97, time: 15 },
      { price: 97.2725, time: 16 },
      { price: 92.845, time: 17 },
      { price: 92.615, time: 18 },
      { price: 94.81, time: 21 },
      { price: 93.2525, time: 22 },
      { price: 95.04, time: 23 },
      { price: 96.19, time: 24 },
      { price: 106.26, time: 25 },
      { price: 108.9375, time: 28 },
    ],
  },
];

describe("Integration - Auth & Candle Data", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";

  const username = `authcandle${Date.now()}`;
  const password = "Passw0rd9";

  beforeAll(async () => {
    dotenv.config();
    const appServer = new AppServer();
    agent = supertest.agent(appServer.getExpressInstance());
    await SchwabAPI.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
  });

  it("registers and logs in", async () => {
    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);

    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    expect(login.body.token).toBeTruthy();
    userToken = login.body.token;
  });

  it("gets candle data", async () => {
    const res = await agent
      .get("/api/candle-data" + candleDataQuery)
      .set("x-access-token", userToken);
    expect(res.status).toBe(HttpStatusCode.Ok);
    expect(res.body.obj).toBeTruthy();
    const obj = res.body.obj[0];
    obj.candles.forEach((candle: ICandle, index: number) => {
      expect(JSON.stringify(candle)).toEqual(
        JSON.stringify(expectedCandleData[0].candles[index]),
      );
    });
  });

  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
