import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { PeriodType } from "../../shared/constants";
import { IStrategy } from "../../types/strategy-types";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const POST = "post";
const DELETE = "delete";

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

describe("Integration - Strategy", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";
  let userId = -1;

  const username = `strategy${Date.now()}`;
  const password = "Passw0rd9";

  const request = (url: string, method: string, payload?: string | object) => {
    switch (method) {
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

    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);
    userId = reg.body.id;
    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    userToken = login.body.token;
  });

  it("creates strategies", async () => {
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
  });

  it("deletes strategy1", async () => {
    const [strat] = await StrategyRepository.getByName(
      [strategy1.name],
      userId,
    );
    expect(strat).toBeTruthy();
    await request("/api/strategy/" + strat.id, DELETE);
    const remaining = await StrategyRepository.getByName(
      [strategy1.name],
      userId,
    );
    expect(remaining.length).toBe(0);
  });

  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
