import * as supertest from "supertest";
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";
import { HttpStatusCode } from "axios";
import { PeriodType } from "../../shared/constants";
import { IStrategy } from "../../types/strategy-types";
import { IStockGroup } from "../../types/entity-types";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const GET = "get";
const POST = "post";
const PATCH = "patch";

const TEST_RESULTS_FOLDER = path.resolve(__dirname, "../expected-test-results");


// for back tests, tradeSize is 1500 and buyingPower is 15000

const readExpected = async (fileName: string, actual: string) => {
  const filePath = path.resolve(TEST_RESULTS_FOLDER, fileName);
  if (process.env.UPDATE_EXPECTED === "1") {
    await fs.writeFile(filePath, JSON.stringify(actual, null, 2));
    return actual;
  }
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
};

describe("Integration - Back Tests", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";
  let userId = -1;

  const username = `testuserback${Date.now()}`; // must be alphanumeric
  const password = "Passw0rd9";

  const strategyDay: IStrategy = {
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

  const strategyHalfHour: IStrategy = {
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
    name: `grp${Math.random().toString(36).slice(2)}`,
    symbols: ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"],
    id: -1,
  };

  const request = (url: string, method: string, payload?: string | object) => {
    switch (method) {
      case GET:
        return agent.get(url).set("x-access-token", userToken);
      case POST:
        return agent.post(url).set("x-access-token", userToken).send(payload);
      case PATCH:
        return agent.patch(url).set("x-access-token", userToken).send(payload);
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
  /**) [85.774, 88.455, 95.002]
0 =
85.774
1 =
88.455
2 =
95.002 */

  it("registers and logs in", async () => {
    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);
    userId = reg.body.id;

    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    userToken = login.body.token;
    expect(userToken).toBeTruthy();
  });

  it("creates strategies and group", async () => {
    const strat1Resp = await request("/api/strategy", POST, strategyDay);
    strategyDay.id = strat1Resp.body.id;
    const [stored1] = await StrategyRepository.getByName(
      [strategyDay.name],
      userId,
    );
    expect(stored1).toBeTruthy();

    const strat2Resp = await request("/api/strategy", POST, strategyHalfHour);
    strategyHalfHour.id = strat2Resp.body.id;
    const [stored2] = await StrategyRepository.getByName(
      [strategyHalfHour.name],
      userId,
    );
    expect(stored2).toBeTruthy();

    const grpResp = await request("/api/group", POST, group);
    group.id = grpResp.body.id;
    const [storedGrp] = await StockGroupRepository.getGroupById(group.id);
    expect(storedGrp).toBeTruthy();
  });

  it("runs back test (daily)", async () => {
    const query = `strategyId=${strategyDay.id}&groupId=${group.id}&startTime=1709269200000&endTime=1742700799869`;
    const res = await request("/api/run/back-test?" + query, PATCH);
    expect(res.status).toBe(HttpStatusCode.Ok);

    const expected = await readExpected("back-test-day-results.json", res.body);
    expect(res.body).toEqual(expected);

    const rows = await DatabaseAPI.runQuery<{
      strategy_id: number;
      group_id: number;
    }>("SELECT * FROM backtest_result ORDER BY id DESC LIMIT 1");
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row.strategy_id).toBe(strategyDay.id);
    expect(row.group_id).toBe(group.id);
  }, 120000);

  it("runs back test (30m)", async () => {
    // Schwab only keeps ~8 months of intraday candles, so this range must stay recent
    const query = `strategyId=${strategyHalfHour.id}&groupId=${group.id}&startTime=1780320600000&endTime=1793390400000`;

    const res = await request("/api/run/back-test?" + query, PATCH);
    expect(res.status).toBe(HttpStatusCode.Ok);

    const expected = await readExpected(
      "back-test-half-hour-results.json",
      res.body,
    );
    expect(res.body).toEqual(expected);

    const rows = await DatabaseAPI.runQuery<{
      strategy_id: number;
      group_id: number;
    }>("SELECT * FROM backtest_result ORDER BY id DESC LIMIT 1");
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row.strategy_id).toBe(strategyHalfHour.id);
    expect(row.group_id).toBe(group.id);
  }, 360000);

  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
