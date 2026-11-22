import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { PeriodType } from "../../shared/constants";
import { IStrategy } from "../../types/strategy-types";
import { IStockGroup } from "../../types/entity-types";
import { ICandle } from "../../types/back-test-types";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const GET = "get";
const POST = "post";
const DELETE = "delete";

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

describe("Integration - Auth/Strategy/Group", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";
  let userId = -1;

  const username = `integrationuser${Date.now()}`;
  const password = "Passw0rd9";

  const strategy1: IStrategy = {
    description: "",
    id: -1,
    period: PeriodType.DAY,
    name: "testStrat1",
    screeners: [
      {
        buySellFilters: {
          enter: {
            connectors: [],
            filters: [
              {
                varName: "percentchange",
                operator: ">",
                compareVal: "7",
                timeAgo: "2",
              },
            ],
          },
          exit: {
            connectors: [],
            filters: [
              {
                varName: "percentchange",
                operator: "<",
                compareVal: "-5",
                timeAgo: "2",
              },
            ],
          },
        },
      },
    ],
  };

  const strategy2: IStrategy = {
    description: "",
    id: -1,
    period: PeriodType.THIRTY_MINUTES,
    name: "testStrat2",
    screeners: [
      {
        buySellFilters: {
          enter: {
            connectors: [],
            filters: [
              {
                varName: "percentchange",
                operator: ">",
                compareVal: "0.8",
                timeAgo: "2",
              },
            ],
          },
          exit: {
            connectors: [],
            filters: [
              {
                varName: "percentchange",
                operator: "<",
                compareVal: "-0.3",
                timeAgo: "1",
              },
            ],
          },
        },
      },
    ],
  };

  const group: IStockGroup = {
    name: Math.random().toString(36).slice(2),
    symbols: ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"],
    id: -1,
  };

  const group2: IStockGroup = {
    name: Math.random().toString(36).slice(2),
    symbols: ["META"],
    id: -1,
  };

  const request = (url: string, method: string, payload?: string | object) => {
    switch (method) {
      case GET:
        return agent.get(url).set("x-access-token", userToken);
      case POST:
        return agent.post(url).set("x-access-token", userToken).send(payload);
      case DELETE:
        return agent.delete(url).set("x-access-token", userToken);
      default:
        return agent.get(url).set("x-access-token", userToken);
    }
  };

  beforeAll(async () => {
    dotenv.config();
    const appServer = new AppServer();
    agent = supertest.agent(appServer.getExpressInstance());
    await SchwabAPI.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
  });

  it("registers and logs in", async () => {
    const res = await agent.post("/user/register").send({ username, password });
    expect(res.status).toBe(HttpStatusCode.Ok);
    expect(res.body.id).toBeTruthy();
    userId = res.body.id;

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

  it("creates strategies and groups", async () => {
    const strat1Resp = await request("/api/strategy", POST, strategy1);
    strategy1.id = strat1Resp.body.id;
    const [stored1] = await StrategyRepository.getByName(
      [strategy1.name],
      userId,
    );
    expect(stored1).toBeTruthy();

    const strat2Resp = await request("/api/strategy", POST, strategy2);
    strategy2.id = strat2Resp.body.id;
    const [stored2] = await StrategyRepository.getByName(
      [strategy2.name],
      userId,
    );
    expect(stored2).toBeTruthy();

    const grpResp = await request("/api/group", POST, group);
    group.id = grpResp.body.id;
    const [storedGrp] = await StockGroupRepository.getGroupById(group.id);
    expect(storedGrp).toBeTruthy();

    const grpResp2 = await request("/api/group", POST, group2);
    group2.id = grpResp2.body.id;
    const [storedGrp2] = await StockGroupRepository.getGroupById(group2.id);
    expect(storedGrp2).toBeTruthy();
  });

  it("deletes strategy and group", async () => {
    const [strat] = await StrategyRepository.getByName(
      [strategy1.name],
      userId,
    );
    expect(strat).toBeTruthy();
    await request("/api/strategy/" + strat.id, DELETE);
    const remainingStrats = await StrategyRepository.getByName(
      [strategy1.name],
      userId,
    );
    expect(remainingStrats.length).toBe(0);

    const [grp] = await StockGroupRepository.getGroupById(group.id);
    expect(grp).toBeTruthy();
    await request("/api/group/" + group.id, DELETE);
    const remainingGroups = await StockGroupRepository.getGroupById(group.id);
    expect(remainingGroups.length).toBe(0);
  });

  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
