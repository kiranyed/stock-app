import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { ICandle } from "../../types/back-test-types";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const candleDataQuery =
  "?symbols=AAPL&startTime=1594011600000&endTime=1596430800000&frequencyMinutes=1440&useClose=true";
const expectedCandleData = [
  {
    symbol: "AAPL",
    postEarningsGain: 0,
    candles: [
      { price: 93.4625, time: 0, datetime: 1594011600000 },
      { price: 93.1725, time: 1, datetime: 1594098000000 },
      { price: 95.3425, time: 2, datetime: 1594184400000 },
      { price: 95.6825, time: 3, datetime: 1594270800000 },
      { price: 95.92, time: 4, datetime: 1594357200000 },
      { price: 95.4775, time: 5, datetime: 1594616400000 },
      { price: 97.0575, time: 6, datetime: 1594702800000 },
      { price: 97.725, time: 7, datetime: 1594789200000 },
      { price: 96.5225, time: 8, datetime: 1594875600000 },
      { price: 96.3275, time: 9, datetime: 1594962000000 },
      { price: 98.3575, time: 10, datetime: 1595221200000 },
      { price: 97, time: 11, datetime: 1595307600000 },
      { price: 97.2725, time: 12, datetime: 1595394000000 },
      { price: 92.845, time: 13, datetime: 1595480400000 },
      { price: 92.615, time: 14, datetime: 1595566800000 },
      { price: 94.81, time: 15, datetime: 1595826000000 },
      { price: 93.2525, time: 16, datetime: 1595912400000 },
      { price: 95.04, time: 17, datetime: 1595998800000 },
      { price: 96.19, time: 18, datetime: 1596085200000 },
      { price: 106.26, time: 19, datetime: 1596171600000 },
      { price: 108.9375, time: 20, datetime: 1596430800000 },
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
    await SchwabAuth.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
  }, 60000);

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
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });
});
