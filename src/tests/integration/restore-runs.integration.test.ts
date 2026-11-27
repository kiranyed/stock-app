import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import AppServer from "../../startup/app-server";
import { LiveJobRunner } from "../../run/live-job-runner";
import { RunService } from "../../services/run-service";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import RunRepository from "../../shared/services/repos/run-repository";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import StrategyMapper from "../../mappers/strategy-mapper";
import PaperPositionRepository from "../../shared/services/repos/paper-position-repository";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";

// Seeded rows (db/seed-required-stock-groups.sql) have no owner.
const SEEDED_STRATEGY_ID = 216; // U-shape
const SEEDED_GROUP_ID = 30; // Amazon (AMZN)

const openSymbols = async (runId: number) =>
  ((await PaperPositionRepository.forRuns([runId])).get(runId) ?? []).map((p) => p.symbol);
const heldInMemory = (runId: number) =>
  Object.keys((LiveJobRunner.getInstance().getJobByRunId(runId) as unknown as { positions: object }).positions);

const status = async (id: number) =>
  (await DatabaseAPI.query<{ status: string }>("select status from live_job where id = ?", [id]))[0].status;

describe("Integration - Reload runs after a restart", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let token = "";
  const runIds = { active: -1, paused: -1, real: -1, orphan: -1 };

  beforeAll(async () => {
    dotenv.config();
    agent = supertest.agent(new AppServer().getExpressInstance());
    await SchwabAuth.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();

    const username = `restore${Date.now()}`;
    const password = "Passw0rd9";
    const userId: number = (await agent.post("/user/register").send({ username, password })).body.id;
    token = (await agent.post("/user/login").send({ username, password })).body.token;

    const [seededStrategy] = await StrategyRepository.getStrategy(SEEDED_STRATEGY_ID);
    const { insertId: strategyId } = await StrategyRepository.createStrategy(
      [StrategyMapper.convertEntityToStrategy(seededStrategy)],
      userId,
    );
    const groupId = await StockGroupRepository.createGroup(`restore${Date.now()}`, ["AMZN"], userId);

    [{ id: runIds.active }] = await RunRepository.createRuns([strategyId], groupId, "simulation", true);
    [{ id: runIds.paused }] = await RunRepository.createRuns([strategyId], groupId, "simulation");
    await RunRepository.setStatus(runIds.paused, ["active"], "paused");
    [{ id: runIds.real }] = await RunRepository.createRuns([strategyId], groupId, "real");
    [{ id: runIds.orphan }] = await RunRepository.createRuns([SEEDED_STRATEGY_ID], SEEDED_GROUP_ID, "simulation");

    // the key of the screener that entered it, as the running strategy would have stored it
    const screenerKey = new StrategySimulation(StrategyMapper.convertEntityToStrategy(seededStrategy)).screenerId(0);
    // entered now: an earlier time could fall in the previous session just after midnight
    const position = { symbol: "AMZN", is_long: true, entry_price: 100, entry_time: Date.now(), quantity: 15, screener_key: screenerKey };
    await PaperPositionRepository.open({ run_id: runIds.active, ...position });
    await PaperPositionRepository.open({ run_id: runIds.real, ...position });

    await RunService.restoreRuns(Date.now());
  }, 180000);

  it("gives a reloaded run back its open positions, and forgets those of runs it ended", async () => {
    expect(heldInMemory(runIds.active)).toEqual(["AMZN"]);
    expect(heldInMemory(runIds.paused)).toEqual([]);
    expect(await openSymbols(runIds.active)).toEqual(["AMZN"]);
    expect(await openSymbols(runIds.real)).toEqual([]);
  });

  it("keeps simulations as they were, and ends real-money runs and runs with no owner", async () => {
    expect(await status(runIds.active)).toBe("active");
    expect(await status(runIds.paused)).toBe("paused");
    expect(await status(runIds.real)).toBe("ended");
    expect(await status(runIds.orphan)).toBe("ended");
  });

  it("lists the reloaded runs as loaded", async () => {
    const sims = await agent.get("/api/run/current-simulations").set("x-access-token", token);
    const real = await agent.get("/api/run/current-strategies").set("x-access-token", token);
    expect(sims.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: runIds.active, status: "active", loaded: true }),
        expect.objectContaining({ id: runIds.paused, status: "paused", loaded: true }),
      ]),
    );
    expect(real.status).toBe(HttpStatusCode.NotFound);
  });

  it("can pause and resume a reloaded run", async () => {
    const pause = await agent
      .patch("/api/run/pause-simulation")
      .set("x-access-token", token)
      .send({ id: runIds.active });
    expect(pause.status).toBe(HttpStatusCode.Ok);
    const resume = await agent
      .patch("/api/run/resume-simulation")
      .set("x-access-token", token)
      .send({ id: runIds.paused });
    expect(resume.status).toBe(HttpStatusCode.Ok);
  });

  it("ending a run forgets its open positions", async () => {
    const end = await agent.patch("/api/run/end-simulation").set("x-access-token", token).send({ id: runIds.active });
    expect(end.status).toBe(HttpStatusCode.Ok);
    expect(await openSymbols(runIds.active)).toEqual([]);
  });

  afterAll(async () => {
    try {
      LiveJobRunner.getInstance().stopAll();
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
