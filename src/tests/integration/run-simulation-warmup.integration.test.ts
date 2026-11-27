import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import AppServer from "../../startup/app-server";
import { LiveJobRunner } from "../../run/live-job-runner";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { PeriodType } from "../../shared/constants";
import { IndicatorEngine } from "../../engine/engine";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import StrategyMapper from "../../mappers/strategy-mapper";

// Seeded rows (db/seed-required-stock-groups.sql) have no owner, so the test user runs its own copies.
const SEEDED_STRATEGY_ID = 216; // U-shape
const SEEDED_GROUP_ID = 30; // Amazon (AMZN)

describe("Integration - Run Simulation Warmup", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";
  let strategyId = -1;
  let groupId = -1;

  const username = `simwarmup${Date.now()}`;
  const password = "Passw0rd9";

  beforeAll(async () => {
    dotenv.config();
    const appServer = new AppServer();
    agent = supertest.agent(appServer.getExpressInstance());

    await SchwabAuth.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();

    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);
    const userId: number = reg.body.id;

    const [seededStrategy] = await StrategyRepository.getStrategy(SEEDED_STRATEGY_ID);
    ({ insertId: strategyId } = await StrategyRepository.createStrategy(
      [StrategyMapper.convertEntityToStrategy(seededStrategy)],
      userId,
    ));
    const [seededGroup] = await StockGroupRepository.getGroup(SEEDED_GROUP_ID);
    groupId = await StockGroupRepository.createGroup(seededGroup.name, ["AMZN"], userId);

    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    userToken = login.body.token;
    expect(userToken).toBeTruthy();
  }, 60000);

  it("won't run a strategy the user doesn't own", async () => {
    const res = await agent
      .patch(`/api/run/simulation?strategyId=${SEEDED_STRATEGY_ID}&groupId=${groupId}`)
      .set("x-access-token", userToken);
    expect(res.status).toBe(HttpStatusCode.NotFound);
  });

  it("populates percentchange50 in the live engine for U-shape on Amazon group", async () => {
    const res = await agent
      .patch(`/api/run/simulation?strategyId=${strategyId}&groupId=${groupId}`)
      .set("x-access-token", userToken);

    expect(res.status).toBe(HttpStatusCode.Ok);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThan(0);

    const runner = LiveJobRunner.getInstance() as unknown as {
      masterJob: {
        engine: IndicatorEngine;
        endAll: () => void;
      };
      endStrategy: (id: number) => void;
      stopAll: () => void;
    };

    const indicator = runner.masterJob.engine.get("AMZN", PeriodType.DAY, "percentchange50");
    expect(indicator).toBeDefined();

    const amznVal = indicator!.value;
    expect(typeof amznVal).toBe("number");
    expect(Number.isNaN(amznVal)).toBe(false);

    // Cleanup this run so it doesn't continue scheduling in later tests.
    for (const run of res.body.runs) {
      runner.endStrategy(run.id);
    }

    runner.stopAll();
  }, 120000);

  afterAll(async () => {
    try {
      const runner = LiveJobRunner.getInstance() as unknown as {
        stopAll: () => void;
      };
      runner.stopAll();
    } catch {
      // ignore cleanup errors to preserve rollback/close behavior below
    }

    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });
});
