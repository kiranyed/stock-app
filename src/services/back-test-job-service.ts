import { randomUUID } from "crypto";
import BaseError from "../errors/base-error";
import Error404 from "../errors/error-404";
import { IGainTotal } from "../types/back-test-types";
import { computeMetrics, IBackTestRequest, RunService } from "./run-service";

export type BackTestJobStatus = "running" | "done" | "failed";

/** One strategy's result: the same numbers as a saved back-test result. */
export interface IBackTestSummary {
  strategyId: number;
  strategyName: string;
  trades: number;
  wins: number;
  winRate: number;
  returnPct: number;
  maxDrawdown: number;
}

interface IBackTestJob {
  id: string;
  userId: number;
  request: IBackTestRequest;
  strategies: { id: number; name: string }[];
  status: BackTestJobStatus;
  startedAt: number;
  finishedAt?: number;
  gains?: unknown[];
  error?: string;
}

/** Finished jobs are kept this long, then forgotten. */
export const KEEP_FINISHED_MS = 60 * 60 * 1000;
/** At most this many finished jobs are kept per user; the oldest go first. */
export const KEEP_FINISHED_PER_USER = 20;

const isGainTotal = (result: unknown): result is IGainTotal =>
  !!result && typeof result === "object" && !Array.isArray(result);

/**
 * Back tests that run in the background: `start` checks the request and ownership, starts the
 * back test (through RunService, so BackTestPool and its limits, and the result is saved like a
 * REST back test) and returns an id at once; `get` reports its status and result. Used by the
 * MCP server, whose clients can't hold a request open for minutes.
 *
 * The registry is in memory: jobs are lost when the process exits (the saved back-test results
 * stay), and finished ones are dropped after an hour or past 20 per user.
 */
export class BackTestJobService {
  private static jobs = new Map<string, IBackTestJob>();

  static async start(userId: number, request: IBackTestRequest): Promise<{ jobId: string; status: BackTestJobStatus }> {
    this.prune(Date.now());
    const { strategies, run } = await RunService.prepareBackTest(userId, request);
    const job: IBackTestJob = {
      id: randomUUID(),
      userId,
      request,
      strategies,
      status: "running",
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    run().then(
      (gains) => {
        job.gains = gains as unknown[];
        job.status = "done";
        job.finishedAt = Date.now();
      },
      (err) => {
        job.status = "failed";
        job.finishedAt = Date.now();
        // our own errors (429, the timeout, Schwab sign-in) are meant for the user; others aren't
        if (err instanceof BaseError) job.error = err.message;
        else {
          console.error(`[back-test job ${job.id}] failed:`, err);
          job.error = "Internal server error";
        }
      },
    );
    return { jobId: job.id, status: job.status };
  }

  /** The job's status, and its summaries once done (with every trade if `includeTrades`). 404 if it isn't the caller's. */
  static get(userId: number, jobId: string, includeTrades = false) {
    this.prune(Date.now());
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) throw new Error404("back test job not found");
    const { id, request, status, startedAt, finishedAt, error } = job;
    return {
      jobId: id,
      status,
      request,
      startedAt,
      ...(finishedAt !== undefined && { finishedAt }),
      ...(error !== undefined && { error }),
      ...(job.gains && { results: this.summarize(job, includeTrades) }),
    };
  }

  /** The caller's jobs, newest first, without results. */
  static list(userId: number) {
    this.prune(Date.now());
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(({ id, request, status, startedAt, finishedAt }) => ({ jobId: id, status, request, startedAt, finishedAt }));
  }

  /** Tests: forget every job. */
  static reset() {
    this.jobs.clear();
  }

  private static summarize(job: IBackTestJob, includeTrades: boolean) {
    return job.strategies.map(({ id, name }, i) => {
      const result = job.gains![i];
      const summary: IBackTestSummary = {
        strategyId: id,
        strategyName: name,
        ...(isGainTotal(result)
          ? computeMetrics(result)
          : { trades: 0, wins: 0, winRate: 0, returnPct: 0, maxDrawdown: 0 }),
      };
      return includeTrades && isGainTotal(result) ? { ...summary, tradeList: result.gains } : summary;
    });
  }

  private static prune(now: number) {
    const finished = new Map<number, IBackTestJob[]>();
    for (const job of this.jobs.values()) {
      if (job.finishedAt === undefined) continue;
      if (now - job.finishedAt > KEEP_FINISHED_MS) {
        this.jobs.delete(job.id);
        continue;
      }
      finished.set(job.userId, [...(finished.get(job.userId) ?? []), job]);
    }
    for (const jobs of finished.values()) {
      jobs
        .sort((a, b) => b.finishedAt! - a.finishedAt!)
        .slice(KEEP_FINISHED_PER_USER)
        .forEach((job) => this.jobs.delete(job.id));
    }
  }
}
