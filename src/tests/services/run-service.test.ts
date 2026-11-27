import Error400 from "../../errors/error-400";
import Error404 from "../../errors/error-404";
import Error409 from "../../errors/error-409";
import { computeMetrics, RunService } from "../../services/run-service";
import { LiveJobRunner } from "../../run/live-job-runner";
import { BackTestPool } from "../../run/back-test-pool";
import { ScreenerJobService } from "../../shared/services/screener-job-service";
import RunRepository from "../../shared/services/repos/run-repository";
import BacktestResultRepository from "../../shared/services/repos/backtest-result-repository";
import PaperPositionRepository from "../../shared/services/repos/paper-position-repository";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";

jest.mock("../../run/live-job-runner");
jest.mock("../../run/back-test-pool");
jest.mock("../../shared/services/screener-job-service");
jest.mock("../../shared/services/repos/run-repository");
jest.mock("../../shared/services/repos/backtest-result-repository");
jest.mock("../../shared/services/repos/paper-position-repository");
jest.mock("../../real-time-trading/strategy-simulation");

const jobs = ScreenerJobService as jest.Mocked<typeof ScreenerJobService>;
const runs = RunRepository as jest.Mocked<typeof RunRepository>;
const results = BacktestResultRepository as jest.Mocked<typeof BacktestResultRepository>;
const runner = {
  runJobs: jest.fn(),
  pauseStrategy: jest.fn(),
  resumeStrategy: jest.fn(),
  endStrategy: jest.fn(),
  getJobByRunId: jest.fn(),
  restoreJobs: jest.fn(),
};
const group = { id: 3, name: "G", symbols: ["A"] };
const job = (id: number) => ({ getConfigId: () => id, getName: () => `S${id}`, getPeriod: () => 1440 });
const run = (fields: object) => ({ id: 5, strategy_id: 4, job_type: "simulation", status: "active", ...fields }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  (LiveJobRunner.getInstance as jest.Mock).mockReturnValue(runner);
});

describe("computeMetrics", () => {
  it("counts trades, wins, return and drawdown", () => {
    const gains = [{ gainPercent: 10 }, { gainPercent: -20 }, { gainPercent: 5 }];
    expect(computeMetrics({ total: 0.1, gains } as never)).toEqual({
      trades: 3,
      wins: 2,
      winRate: (2 / 3) * 100,
      returnPct: 10,
      maxDrawdown: expect.closeTo(20, 6),
    });
    expect(computeMetrics({} as never)).toMatchObject({ trades: 0, winRate: 0, returnPct: 0, maxDrawdown: 0 });
  });
});

describe("RunService.backTest", () => {
  const request = { strategyIds: [4, 6], groupId: 3, startTime: 100, endTime: 200 };

  it("sets up the caller's strategies, runs them, and saves each result", async () => {
    const strategies = [{ id: 4 }, { id: 6 }];
    jobs.setUpStrategyBackTest.mockResolvedValue({ runs: [job(4), job(6)], strategies, group } as never);
    const gains = [{ total: 0.05, gains: [{ gainPercent: 5 }] }, []];
    (BackTestPool.run as jest.Mock).mockResolvedValue({ results: gains, runtimeMs: 1234 });
    results.insert.mockResolvedValue(1);

    await expect(RunService.backTest(7, request)).resolves.toBe(gains);
    expect(jobs.setUpStrategyBackTest).toHaveBeenCalledWith(7, [4, 6], 3);
    expect(BackTestPool.run).toHaveBeenCalledWith(7, {
      kind: "strategies",
      strategies,
      group,
      config: { startTime: 100, endTime: 200 },
    });
    expect(results.insert).toHaveBeenCalledTimes(1); // the empty result isn't saved
    expect(results.insert.mock.calls[0][0]).toMatchObject({
      strategyId: 4,
      groupId: 3,
      strategyName: "S4",
      groupName: "G",
      returnPct: 5,
      trades: 1,
      winRate: 100,
      status: "SUCCESS",
      runtimeMs: 1234, // the worker's own time, not the wait for a free worker
    });
  });

  it("still answers when saving a result fails", async () => {
    jobs.setUpStrategyBackTest.mockResolvedValue({ runs: [job(4)], strategies: [{ id: 4 }], group } as never);
    (BackTestPool.run as jest.Mock).mockResolvedValue({ results: [{ total: 0, gains: [] }], runtimeMs: 1 });
    results.insert.mockRejectedValue(new Error("db down"));
    await expect(RunService.backTest(7, { ...request, strategyIds: [4] })).resolves.toHaveLength(1);
  });

  it("refuses a start after the end before touching anything", async () => {
    await expect(RunService.backTest(7, { ...request, startTime: 200 })).rejects.toBeInstanceOf(Error400);
    expect(jobs.setUpStrategyBackTest).not.toHaveBeenCalled();
  });

  it("lists only the caller's results", async () => {
    results.getCompletedByGroup.mockResolvedValue([]);
    await RunService.backTestResults(7, 3, [4]);
    expect(results.getCompletedByGroup).toHaveBeenCalledWith(7, 3, [4]);
  });
});

describe("RunService live runs", () => {
  it("starts paper simulations of the caller's strategies", async () => {
    jobs.setUpStrategyRunsLive.mockResolvedValue({ runs: ["job"], group } as never);
    runner.runJobs.mockResolvedValue([{ id: 9 }]);

    await expect(RunService.start(7, { strategyIds: [4], groupId: 3, notifyOnEntry: true })).resolves.toEqual([
      { id: 9 },
    ]);
    expect(jobs.setUpStrategyRunsLive).toHaveBeenCalledWith(7, [4], 3, { notifyOnEntry: true });
    expect(runner.runJobs).toHaveBeenCalledWith(["job"], group, true);

  });

  it.each([
    ["pause", ["active"], "paused", "pauseStrategy"],
    ["resume", ["paused"], "active", "resumeStrategy"],
    ["end", ["active", "paused"], "ended", "endStrategy"],
  ] as const)("can %s the caller's own run", async (action, from, to, runnerMethod) => {
    runs.getOwnedRun.mockResolvedValue(run({ status: from[0] }));
    runs.setStatus.mockResolvedValue(1);
    runner.getJobByRunId.mockReturnValue({});
    await RunService[action](7, 5);
    expect(runs.getOwnedRun).toHaveBeenCalledWith(5, 7);
    expect(runs.setStatus).toHaveBeenCalledWith(5, from, to);
    expect(runner[runnerMethod]).toHaveBeenCalledWith(5);
  });

  it("says 404 for someone else's run, or a run of the other type, and changes nothing", async () => {
    runs.getOwnedRun.mockResolvedValueOnce(undefined).mockResolvedValueOnce(run({ job_type: "real" }));
    await expect(RunService.end(7, 5)).rejects.toBeInstanceOf(Error404);
    await expect(RunService.end(7, 5)).rejects.toBeInstanceOf(Error404);
    expect(runs.setStatus).not.toHaveBeenCalled();
    expect(runner.endStrategy).not.toHaveBeenCalled();
  });

  it("refuses a change that doesn't fit the run's status", async () => {
    runs.getOwnedRun.mockResolvedValue(run({ status: "ended" }));
    runs.setStatus.mockResolvedValue(0);
    await expect(RunService.resume(7, 5)).rejects.toThrow("Run 5 is ended; it can't be resumed");
    expect(runner.resumeStrategy).not.toHaveBeenCalled();
  });

  it.each(["pause", "resume"] as const)("says 409 to %s a run this server hasn't loaded, and changes nothing", async (action) => {
    runs.getOwnedRun.mockResolvedValue(run({ status: action === "pause" ? "active" : "paused" }));
    runner.getJobByRunId.mockReturnValue(undefined);
    await expect(RunService[action](7, 5)).rejects.toBeInstanceOf(Error409);
    expect(runs.setStatus).not.toHaveBeenCalled();
  });

  it("ends a run in memory, lets its queued position writes land, then forgets its positions", async () => {
    const order: string[] = [];
    const job = new StrategySimulation({} as never);
    (job.flushWrites as jest.Mock).mockImplementation(async () => order.push("flush"));
    runner.endStrategy.mockImplementation(() => order.push("end"));
    runs.forgetPositions.mockImplementation(async () => {
      order.push("forget");
    });
    runs.getOwnedRun.mockResolvedValue(run({ status: "active" }));
    runs.setStatus.mockResolvedValue(1);
    runner.getJobByRunId.mockReturnValue(job);
    await RunService.end(7, 5);
    expect(order).toEqual(["end", "flush", "forget"]);
    expect(runs.forgetPositions).toHaveBeenCalledWith([5]);
  });

  it("can end a run this server hasn't loaded", async () => {
    runs.getOwnedRun.mockResolvedValue(run({ status: "active" }));
    runs.setStatus.mockResolvedValue(1);
    runner.getJobByRunId.mockReturnValue(undefined);
    await RunService.end(7, 5);
    expect(runs.setStatus).toHaveBeenCalledWith(5, ["active", "paused"], "ended");
    expect(runs.forgetPositions).toHaveBeenCalledWith([5]);
  });

  it("shows vars only for the caller's run", async () => {
    runner.getJobByRunId.mockReturnValue({ getVars: () => ({ rsi: 40 }) });
    runs.getOwnedRun.mockResolvedValueOnce(run({})).mockResolvedValueOnce(undefined);
    await expect(RunService.getVars(7, 5)).resolves.toEqual({ runId: 5, vars: { rsi: 40 } });
    await expect(RunService.getVars(8, 5)).rejects.toBeInstanceOf(Error404);
  });

  it("lists and gets only the caller's runs, saying which are loaded", async () => {
    runs.getCurrentRuns.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
    runs.getOwnedRuns.mockResolvedValue([]);
    runner.getJobByRunId.mockImplementation((id: number) => (id === 1 ? {} : undefined));
    await expect(RunService.listCurrent(7)).resolves.toEqual([
      { id: 1, loaded: true },
      { id: 2, loaded: false },
    ]);
    await RunService.getRuns(7, [1, 2]);
    expect(runs.getCurrentRuns).toHaveBeenCalledWith(7, "simulation");
    expect(runs.getOwnedRuns).toHaveBeenCalledWith([1, 2], 7);
  });
});

describe("RunService.restoreRuns", () => {
  const row = (fields: object) =>
    ({ id: 1, strategy_id: 4, group_id: 3, status: "active", job_type: "simulation", owner_id: 7, notify_on_entry: 0, ...fields }) as never;
  const strategy = (id: number) => ({ id }) as never;
  const made: { id?: number; options: unknown; job: StrategySimulation }[] = [];

  beforeEach(() => {
    made.length = 0;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jobs.createStrategyRuns.mockImplementation((_s, options) => {
      const job = new StrategySimulation({} as never);
      const entry: (typeof made)[number] = { options, job };
      made.push(entry);
      (job.setId as jest.Mock).mockImplementation((id: number) => (entry.id = id));
      (job.getId as jest.Mock).mockImplementation(() => entry.id);
      return [job] as never;
    });
    runs.endRuns.mockResolvedValue(1);
    (PaperPositionRepository.forRuns as jest.Mock).mockResolvedValue(new Map());
  });

  it("reloads only runs started before boot", async () => {
    runs.getUnfinishedRuns.mockResolvedValue([]);
    await RunService.restoreRuns(1234);
    expect(runs.getUnfinishedRuns).toHaveBeenCalledWith(1234);
  });

  it("reloads each group's simulations as they were, with their email setting", async () => {
    runs.getUnfinishedRuns.mockResolvedValue([row({ id: 1, notify_on_entry: 1 }), row({ id: 2, status: "paused" })]);
    jobs.setUpStrategies.mockResolvedValue({ strategies: [strategy(4)], group } as never);

    await RunService.restoreRuns(Date.now());

    expect(jobs.setUpStrategies).toHaveBeenCalledWith(7, [4, 4], 3);
    expect(made.map(({ id, options }) => ({ id, options }))).toEqual([
      { id: 1, options: { notifyOnEntry: true } },
      { id: 2, options: undefined },
    ]);
    expect(runner.restoreJobs).toHaveBeenCalledWith(expect.any(Array), group, new Set([2]));
    expect(runs.endRuns).not.toHaveBeenCalled();
  });

  it("gives each reloaded run back the positions it held", async () => {
    const held = { run_id: 1, symbol: "A", is_long: true, entry_price: 10, entry_time: 5, quantity: 3, screener_index: 0 };
    runs.getUnfinishedRuns.mockResolvedValue([row({ id: 1 }), row({ id: 2 })]);
    jobs.setUpStrategies.mockResolvedValue({ strategies: [strategy(4)], group } as never);
    (PaperPositionRepository.forRuns as jest.Mock).mockResolvedValue(new Map([[1, [held]]]));

    await RunService.restoreRuns(Date.now());

    expect(PaperPositionRepository.forRuns).toHaveBeenCalledWith([1, 2]);
    expect(made[0].job.restorePositions).toHaveBeenCalledWith([held]);
    expect(made[1].job.restorePositions).toHaveBeenCalledWith([]);
  });

  it("ends real-money runs instead of reloading them", async () => {
    runs.getUnfinishedRuns.mockResolvedValue([row({ id: 1, job_type: "real" }), row({ id: 2, job_type: "real", status: "paused" })]);

    await RunService.restoreRuns(Date.now());

    expect(runs.endRuns).toHaveBeenCalledWith([1, 2]);
    expect(jobs.setUpStrategies).not.toHaveBeenCalled();
    expect(runner.restoreJobs).not.toHaveBeenCalled();
  });

  it("ends runs nobody can control: no owner, or strategy and group no longer the same user's", async () => {
    runs.getUnfinishedRuns.mockResolvedValue([row({ id: 1, owner_id: null }), row({ id: 2, group_id: 9 })]);
    jobs.setUpStrategies.mockRejectedValue(new Error404("stock group not found"));

    await RunService.restoreRuns(Date.now());

    expect(runs.endRuns).toHaveBeenCalledWith([1]);
    expect(runs.endRuns).toHaveBeenCalledWith([2]);
    expect(runner.restoreJobs).not.toHaveBeenCalled();
  });

  it("leaves a group's runs alone when it fails to load, and still loads the other groups", async () => {
    runs.getUnfinishedRuns.mockResolvedValue([row({ id: 1, group_id: 3 }), row({ id: 2, group_id: 8 })]);
    jobs.setUpStrategies.mockResolvedValue({ strategies: [strategy(4)], group } as never);
    runner.restoreJobs.mockRejectedValueOnce(new Error("Schwab not signed in")).mockResolvedValueOnce(undefined);

    await RunService.restoreRuns(Date.now());

    expect(runner.restoreJobs).toHaveBeenCalledTimes(2);
    expect(runs.endRuns).not.toHaveBeenCalled();
  });
});

describe("RunService.prepareBackTest", () => {
  const request = { strategyIds: [4, 6], groupId: 3, startTime: 100, endTime: 200 };

  it("checks ownership and returns the strategies, without running anything yet", async () => {
    jobs.setUpStrategyBackTest.mockResolvedValue({ runs: [job(4), job(6)], strategies: [{ id: 4 }, { id: 6 }], group } as never);
    const prepared = await RunService.prepareBackTest(7, request);
    expect(jobs.setUpStrategyBackTest).toHaveBeenCalledWith(7, [4, 6], 3);
    expect(prepared.strategies).toEqual([
      { id: 4, name: "S4" },
      { id: 6, name: "S6" },
    ]);
    expect(BackTestPool.run).not.toHaveBeenCalled();

    (BackTestPool.run as jest.Mock).mockResolvedValue({ results: [[], []], runtimeMs: 1 });
    await expect(prepared.run()).resolves.toEqual([[], []]);
    expect(BackTestPool.run).toHaveBeenCalledWith(7, expect.objectContaining({ kind: "strategies" }));
  });

  it("rejects a bad range or someone else's group before setting anything up", async () => {
    await expect(RunService.prepareBackTest(7, { ...request, endTime: 100 })).rejects.toBeInstanceOf(Error400);
    expect(jobs.setUpStrategyBackTest).not.toHaveBeenCalled();
    jobs.setUpStrategyBackTest.mockRejectedValue(new Error404("stock group not found"));
    await expect(RunService.prepareBackTest(7, request)).rejects.toBeInstanceOf(Error404);
  });
});
