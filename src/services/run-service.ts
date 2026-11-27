import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import Error409 from "../errors/error-409";
import { LiveJobRunner } from "../run/live-job-runner";
import { BackTestPool } from "../run/back-test-pool";
import { ScreenerJobService } from "../shared/services/screener-job-service";
import RunRepository, {
  ICurrentRun,
  IUnfinishedRun,
  JobStatus,
} from "../shared/services/repos/run-repository";
import BacktestResultRepository, { BacktestResultRow } from "../shared/services/repos/backtest-result-repository";
import { IGainTotal } from "../types/back-test-types";
import { ILiveJobRunEntity } from "../types/entity-types";
import PaperPositionRepository from "../shared/services/repos/paper-position-repository";
import { StrategySimulation } from "../real-time-trading/strategy-simulation";

export interface IBackTestRequest {
  strategyIds: number[];
  groupId: number;
  startTime: number;
  endTime: number;
}

export interface IStartRunRequest {
  strategyIds: number[];
  groupId: number;
  /** Simulations only: send an alert when a position is entered or exited. */
  notifyOnEntry?: boolean;
}

/** Trade count, win rate and return (all percentages) for one back test. */
export const computeMetrics = (result: IGainTotal) => {
  const gains = result.gains || [];
  const trades = result.tradeNum ?? gains.length;
  const wins = gains.filter((g) => g.gainPercent > 0).length;
  const winRate = trades ? (wins / trades) * 100 : 0;
  const returnPct = (result.total ?? 0) * 100;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  gains.forEach((g) => {
    equity *= 1 + g.gainPercent / 100;
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  });

  return { trades, wins, winRate, returnPct, maxDrawdown };
};

const TRANSITIONS: Record<"pause" | "resume" | "end", { from: JobStatus[]; to: JobStatus }> = {
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  end: { from: ["active", "paused"], to: "ended" },
};

/**
 * Back tests and paper simulations, always on behalf of one user. Runs and results belong to
 * whoever owns their strategy; you can only run your own strategies on your own groups.
 */
export class RunService {
  /** Runs the back tests, saves each result, and returns the gains. */
  static async backTest(userId: number, request: IBackTestRequest) {
    return (await this.prepareBackTest(userId, request)).run();
  }

  /**
   * Checks the request and that the strategies and group are the caller's, then returns the
   * strategies (in result order) and a `run` that runs the back test, saves each result and
   * returns the gains. A caller that runs it in the background (the MCP server) can report a
   * bad request at once.
   */
  static async prepareBackTest(userId: number, request: IBackTestRequest) {
    const { strategyIds, groupId, startTime, endTime } = request;
    if (startTime >= endTime) throw new Error400("startTime must be before endTime");
    const setup = await ScreenerJobService.setUpStrategyBackTest(userId, strategyIds, groupId);
    return {
      strategies: setup.runs.map((run) => ({ id: run.getConfigId(), name: run.getName() })),
      run: () => this.runBackTest(userId, request, setup),
    };
  }

  private static async runBackTest(
    userId: number,
    { strategyIds, groupId, startTime, endTime }: IBackTestRequest,
    { runs, strategies, group }: Awaited<ReturnType<typeof ScreenerJobService.setUpStrategyBackTest>>,
  ) {
    console.log(
      `Running backtest for strategy ids: ${strategyIds} with group id: ${groupId} from ` +
        `${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`,
    );
    // runtimeMs is the back test itself, not the wait for a free worker
    const { results: gains, runtimeMs } = await BackTestPool.run(userId, {
      kind: "strategies",
      strategies,
      group,
      config: { startTime, endTime },
    });

    const saved = await Promise.allSettled(
      gains.map((result, idx) => {
        if (Array.isArray(result)) return Promise.resolve();
        const run = runs[idx];
        const { trades, winRate, returnPct, maxDrawdown } = computeMetrics(result as IGainTotal);
        return BacktestResultRepository.insert({
          strategyId: run.getConfigId(),
          groupId: group.id,
          strategyName: run.getName(),
          groupName: group.name,
          startTime,
          endTime,
          period: run.getPeriod(),
          returnPct,
          winRate,
          trades,
          maxDrawdown,
          status: "SUCCESS",
          runtimeMs,
          createdAt: Date.now(),
        });
      }),
    );
    const failed = saved.find((r) => r.status === "rejected");
    if (failed) console.error("Failed to persist backtest_result", (failed as PromiseRejectedResult).reason);
    console.log(`Backtest completed in ${(runtimeMs / 1000).toFixed(2)} seconds`);
    return gains;
  }

  static backTestResults(userId: number, groupId: number, strategyIds?: number[]): Promise<BacktestResultRow[]> {
    return BacktestResultRepository.getCompletedByGroup(userId, groupId, strategyIds);
  }

  /** Starts live runs of the user's strategies on the user's group. */
  static async start(userId: number, request: IStartRunRequest): Promise<ILiveJobRunEntity[]> {
    const options = request.notifyOnEntry ? { notifyOnEntry: true } : undefined;
    const { runs, group } = await ScreenerJobService.setUpStrategyRunsLive(
      userId,
      request.strategyIds,
      request.groupId,
      options,
    );
    return LiveJobRunner.getInstance().runJobs(runs, group, Boolean(options?.notifyOnEntry));
  }

  /** The user's active and paused runs. `loaded` is false for a run this server isn't running (yet). */
  static async listCurrent(userId: number): Promise<(ICurrentRun & { loaded: boolean })[]> {
    const runner = LiveJobRunner.getInstance();
    const runs = await RunRepository.getCurrentRuns(userId, "simulation");
    return runs.map((run) => ({ ...run, loaded: Boolean(runner.getJobByRunId(run.id)) }));
  }

  /**
   * Reloads active and paused simulations after a restart, one owner and group at a time, with
   * the open positions they held (paper_position).
   * - Real-money runs are ended: their open positions and orders were only in memory, so a
   *   reloaded one would treat its own positions as pre-existing and sell anything bought since.
   * - Runs nobody can control (strategy missing or without an owner, or strategy and group no
   *   longer the same user's) are ended.
   * - If a group fails to load (e.g. Schwab not signed in), its runs are left as they are and
   *   show `loaded: false`; they can be ended and started again.
   * Only runs started before `bootTime` are touched: runs started since are this process's own.
   */
  static async restoreRuns(bootTime: number): Promise<void> {
    const rows = await RunRepository.getUnfinishedRuns(bootTime);
    const real = rows.filter((row) => row.job_type === "real").map((row) => row.id);
    const orphans = rows.filter((row) => row.job_type !== "real" && row.owner_id === null).map((row) => row.id);
    if (real.length) {
      await RunRepository.endRuns(real);
      console.warn(`[restore] ended real-money runs (they can't resume safely after a restart): ${real.join(", ")}`);
    }
    if (orphans.length) {
      await RunRepository.endRuns(orphans);
      console.warn(`[restore] ended runs whose strategy is missing or has no owner: ${orphans.join(", ")}`);
    }

    const byGroup = new Map<string, IUnfinishedRun[]>();
    for (const row of rows) {
      if (row.job_type === "real" || row.owner_id === null) continue;
      const key = `${row.owner_id}:${row.group_id}`;
      byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
    }
    for (const group of byGroup.values()) {
      try {
        await this.restoreGroup(group);
      } catch (err) {
        console.error(`[restore] could not reload runs ${group.map((r) => r.id).join(", ")}; left as they are`, err);
      }
    }
  }

  private static async restoreGroup(rows: IUnfinishedRun[]) {
    const userId = rows[0].owner_id as number;
    const ids = rows.map((row) => row.id);
    let setup;
    try {
      setup = await ScreenerJobService.setUpStrategies(userId, rows.map((row) => row.strategy_id), rows[0].group_id);
    } catch (err) {
      if (!(err instanceof Error404)) throw err;
      await RunRepository.endRuns(ids);
      console.warn(`[restore] ended runs ${ids.join(", ")}: ${err.message}`);
      return;
    }

    const strategies = new Map(setup.strategies.map((strategy) => [strategy.id, strategy]));
    const jobs = rows.map((row) => {
      const [job] = ScreenerJobService.createStrategyRuns(
        [strategies.get(row.strategy_id)!],
        row.notify_on_entry ? { notifyOnEntry: true } : undefined,
      );
      job.setId(row.id);
      return job;
    });
    // what each run held when the server stopped
    const positions = await PaperPositionRepository.forRuns(ids);
    for (const job of jobs) {
      if (job instanceof StrategySimulation) job.restorePositions(positions.get(job.getId()) ?? []);
    }
    const pausedIds = new Set(rows.filter((row) => row.status === "paused").map((row) => row.id));
    await LiveJobRunner.getInstance().restoreJobs(jobs, setup.group, pausedIds);
    console.log(`[restore] reloaded runs ${ids.join(", ")} on group ${setup.group.id}`);
  }

  /** The user's runs among `ids`; others' are left out. */
  static getRuns(userId: number, ids: number[]): Promise<ILiveJobRunEntity[]> {
    return RunRepository.getOwnedRuns(ids, userId);
  }

  static pause(userId: number, id: number) {
    return this.transition(userId, id, "pause");
  }

  static resume(userId: number, id: number) {
    return this.transition(userId, id, "resume");
  }

  static end(userId: number, id: number) {
    return this.transition(userId, id, "end");
  }

  /** The indicator values of a run that is active or paused in this process. */
  static async getVars(userId: number, runId: number) {
    const run = (await RunRepository.getOwnedRun(runId, userId))
      ? LiveJobRunner.getInstance().getJobByRunId(runId)
      : undefined;
    if (!run) throw new Error404(`No active or paused run found for id ${runId}`);
    return { runId, vars: run.getVars() };
  }

  private static async transition(userId: number, id: number, action: keyof typeof TRANSITIONS) {
    const run = await RunRepository.getOwnedRun(id, userId);
    if (!run || run.job_type !== "simulation") throw new Error404("simulation run not found");

    const { from, to } = TRANSITIONS[action];
    const refuse = () =>
      new Error400(`Run ${id} is ${run.status}; it can't be ${action === "end" ? "ended" : action + "d"}`);
    if (!from.includes(run.status as JobStatus)) throw refuse();
    const runner = LiveJobRunner.getInstance();
    // ending always works, so a run that never loaded can be cleaned up
    if (action !== "end" && !runner.getJobByRunId(id)) {
      throw new Error409(`Run ${id} isn't loaded on this server; end it and start it again`);
    }
    if (!(await RunRepository.setStatus(id, from, to))) throw refuse();
    if (action === "pause") runner.pauseStrategy(id);
    else if (action === "resume") runner.resumeStrategy(id);
    else {
      // stop it first, and let its queued position writes land, so none comes after the delete
      const job = runner.getJobByRunId(id);
      runner.endStrategy(id);
      if (job instanceof StrategySimulation) await job.flushWrites();
      await RunRepository.forgetPositions([id]);
    }
  }
}
