import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import AppServer from "../../startup/app-server";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { PeriodType } from "../../shared/constants";
import RunRepository from "../../shared/services/repos/run-repository";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { BacktestResultRepository } from "../../shared/services/repos/backtest-result-repository";

/** `live_job` and `backtest_result` keep their foreign keys to strategy and group (no cascade). */
describe("Integration - Deleting a strategy or group with run history", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let token = "";
  let userId = -1;
  const ids = { ranStrategy: -1, testedStrategy: -1, cleanStrategy: -1, ranGroup: -1, testedGroup: -1, cleanGroup: -1 };
  const del = (url: string) => agent.delete(url).set("x-access-token", token);

  const strategy = async (name: string) =>
    (await StrategyRepository.createStrategy([{ name, description: "", period: PeriodType.DAY, screeners: [] }], userId))
      .insertId;
  const strategyExists = async (id: number) => (await StrategyRepository.getStrategy(id)).length === 1;
  const groupExists = async (id: number) => (await StockGroupRepository.getGroupById(id)).length === 1;

  beforeAll(async () => {
    dotenv.config();
    agent = supertest.agent(new AppServer().getExpressInstance());
    await SchwabAuth.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();

    const username = `delhistory${Date.now()}`;
    const password = "Passw0rd9";
    userId = (await agent.post("/user/register").send({ username, password })).body.id;
    token = (await agent.post("/user/login").send({ username, password })).body.token;

    ids.ranStrategy = await strategy("Ran");
    ids.testedStrategy = await strategy("Tested");
    ids.cleanStrategy = await strategy("Clean");
    ids.ranGroup = await StockGroupRepository.createGroup("Ran group", ["AAPL"], userId);
    ids.testedGroup = await StockGroupRepository.createGroup("Tested group", ["MSFT"], userId);
    ids.cleanGroup = await StockGroupRepository.createGroup("Clean group", ["TSLA"], userId);

    const [run] = await RunRepository.createRuns([ids.ranStrategy], ids.ranGroup, "simulation");
    await RunRepository.endRuns([run.id]);
    await BacktestResultRepository.insert({
      strategyId: ids.testedStrategy,
      groupId: ids.testedGroup,
      startTime: 1,
      endTime: 2,
      createdAt: Date.now(),
    });
  }, 60000);

  it("answers 409 for a strategy with a run, saying why, and keeps it", async () => {
    const res = await del(`/api/strategy/${ids.ranStrategy}`);
    expect(res.status).toBe(HttpStatusCode.Conflict);
    expect(res.body.message).toMatch(/"Ran" has 1 run\..*can't be deleted/);
    expect(await strategyExists(ids.ranStrategy)).toBe(true);
  });

  it("deletes none of several strategies when one has a saved back test", async () => {
    const res = await del(`/api/strategy?id=${ids.cleanStrategy}&id=${ids.testedStrategy}`);
    expect(res.status).toBe(HttpStatusCode.Conflict);
    expect(res.body.message).toMatch(/"Tested" has 1 saved back-test result\./);
    expect(await strategyExists(ids.cleanStrategy)).toBe(true);
    expect(await strategyExists(ids.testedStrategy)).toBe(true);
  });

  it("answers 409 for groups with a run or a saved back test, and keeps them", async () => {
    const ran = await del(`/api/group/${ids.ranGroup}`);
    expect(ran.status).toBe(HttpStatusCode.Conflict);
    expect(ran.body.message).toMatch(/"Ran group" has 1 run\..*a group that has any can't be deleted/);

    const tested = await del(`/api/group?id=${ids.testedGroup}&id=${ids.cleanGroup}`);
    expect(tested.status).toBe(HttpStatusCode.Conflict);
    expect(tested.body.message).toMatch(/"Tested group" has 1 saved back-test result\./);

    expect(await groupExists(ids.ranGroup)).toBe(true);
    expect(await groupExists(ids.testedGroup)).toBe(true);
    expect(await groupExists(ids.cleanGroup)).toBe(true);
  });

  it("still deletes a strategy and a group without history", async () => {
    expect((await del(`/api/strategy/${ids.cleanStrategy}`)).status).toBe(HttpStatusCode.Ok);
    expect((await del(`/api/group/${ids.cleanGroup}`)).status).toBe(HttpStatusCode.NoContent);
    expect(await strategyExists(ids.cleanStrategy)).toBe(false);
    expect(await groupExists(ids.cleanGroup)).toBe(false);
  });

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });
});
