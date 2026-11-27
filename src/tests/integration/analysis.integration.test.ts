import * as supertest from "supertest";
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";
import { HttpStatusCode } from "axios";
import { PeriodType } from "../../shared/constants";
import { IStockGroup } from "../../types/entity-types";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const GET = "get";
const POST = "post";
const TEST_RESULTS_FOLDER = path.resolve(__dirname, "../expected-test-results");

const readExpected = async <T>(fileName: string, actual: T): Promise<T> => {
  const filePath = path.resolve(TEST_RESULTS_FOLDER, fileName);
  if (process.env.UPDATE_EXPECTED === "1") {
    await fs.writeFile(filePath, JSON.stringify(actual, null, 2));
    return actual;
  }
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
};

describe("Integration - Analysis", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";

  const username = `analysisuser${Date.now()}`;
  const password = "Passw0rd9";

  const group: IStockGroup = {
    name: `grpanalysis${Date.now()}`,
    symbols: ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"],
    id: -1,
  };

  const request = (url: string, method: string, payload?: string | object) => {
    switch (method) {
      case GET:
        return agent.get(url).set("x-access-token", userToken);
      case POST:
        return agent.post(url).set("x-access-token", userToken).send(payload);
      default:
        return agent.get(url).set("x-access-token", userToken);
    }
  };

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
    userToken = login.body.token;
    expect(userToken).toBeTruthy();
  });

  it("creates group", async () => {
    const grpResp = await request("/api/group", POST, group);
    group.id = grpResp.body.id;
    expect(group.id).toBeTruthy();
  });

  it("refuses another user's group", async () => {
    const other = `${username}x`;
    await agent.post("/user/register").send({ username: other, password });
    const { token } = (await agent.post("/user/login").send({ username: other, password })).body;
    const analysis = await agent.post("/api/analysis/get-data").set("x-access-token", token).send({
      scenarioFilters: [{ varName: "percentchange", operator: ">", compareVal: "7", timeAgo: "4" }],
      dataFilters: [],
      period: PeriodType.DAY,
      startTime: 1709269200000,
      endTime: 1742700799869,
      groupId: group.id,
    });
    const variables = await agent
      .post("/api/analysis/check-variables")
      .set("x-access-token", token)
      .send({ groupId: group.id, variables: [{ varName: "percentchange", timeAgo: "10" }] });
    for (const res of [analysis, variables]) {
      expect(res.status).toBe(HttpStatusCode.NotFound);
      expect(res.body.message).toBe("stock group not found");
    }
  });

  it("runs analysis", async () => {
    const res = await request("/api/analysis/get-data", POST, {
      scenarioFilters: [
        {
          varName: "percentchange",
          operator: ">",
          compareVal: "7",
          timeAgo: "4",
        },
      ],
      period: PeriodType.DAY,
      startTime: 1709269200000,
      endTime: 1742700799869,
      groupId: group.id,
      dataFilters: [
        {
          varName: "percentchange",
          operator: "<",
          compareVal: "-3",
          timeAgo: "-5",
        },
      ],
    });
    expect(res.status).toBe(HttpStatusCode.Ok);
    const results = res.body.analysisData;
    expect(results).toBeTruthy();

    const expected = await readExpected("analysis.json", results);
    expect(results).toEqual(expected);
    expect(results.length).toBe(122);
  });

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });
});
