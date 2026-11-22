import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import AppServer from "../../startup/app-server";
import { LiveJobRunner } from "../../run/live-job-runner";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAPI } from "../../shared/services/trading-api";
import { PeriodType } from "../../shared/constants";

describe("Integration - Run Simulation Warmup", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";

  const username = `simwarmup${Date.now()}`;
  const password = "Passw0rd9";

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

  it("populates percentchange50 in LiveJobRunner masterJob allVars for U-shape on Amazon group", async () => {
    const strategyId = 216; // U-shape
    const groupId = 30; // Amazon (AMZN)

    const res = await agent
      .patch(`/api/run/simulation?strategyId=${strategyId}&groupId=${groupId}`)
      .set("x-access-token", userToken);

    expect(res.status).toBe(HttpStatusCode.Ok);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThan(0);

    const runner = LiveJobRunner.getInstance() as unknown as {
      masterJob: {
        allVars: Record<number, Record<string, Record<string, number>>>;
        endAll: () => void;
      };
      endStrategy: (id: number) => void;
      stopAll: () => void;
    };

    const dayVars = runner.masterJob.allVars[PeriodType.DAY];
    expect(dayVars).toBeDefined();
    expect(dayVars.percentchange50).toBeDefined();

    const amznVal = dayVars.percentchange50.AMZN;
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

    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
