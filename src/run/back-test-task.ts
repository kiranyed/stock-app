// A back test described as plain data, so it can be sent to a worker thread. The worker
// builds the jobs from it; class instances can't cross a thread boundary.

import BaseError from "../errors/base-error";
import { VariableCheckBackTest } from "../analysis/variable-check-back-test";
import { AnalysisBackTestFactory } from "../factory/analysis-back-test-factory";
import { BackTestFactory } from "../factory/back-test-factory";
import { PeriodType, ScreenerJobType } from "../shared/constants";
import { ITestConfig } from "../types/back-test-types";
import { IBackTestScreenerJob } from "../types/data-processing-types";
import { IStockGroup } from "../types/entity-types";
import { IFilter, IFilterGroup, IStrategy } from "../types/strategy-types";
import { BackTestService } from "./back-test-service";

export type BackTestTask = { group: IStockGroup; config: ITestConfig } & (
  | { kind: "strategies"; strategies: IStrategy[] }
  | { kind: "analysis"; period: PeriodType; scenarioFilterGroup: IFilterGroup; dataFilters: IFilter[] }
  | { kind: "variables"; variables: IFilter[] }
);

export type BackTestResults = Awaited<ReturnType<typeof BackTestService.runBackTests>>;

/** A finished back test: its results, and how long it ran (not counting time waiting for a worker). */
export interface BackTestRun {
  results: BackTestResults;
  runtimeMs: number;
}

const buildJobs = (task: BackTestTask): IBackTestScreenerJob[] => {
  switch (task.kind) {
    case "strategies":
      return task.strategies.map((strategy) =>
        BackTestFactory.createBackTestInstance(ScreenerJobType.STRATEGY, strategy),
      );
    case "analysis":
      return [AnalysisBackTestFactory.createAnalysisBackTest(task.period, task.scenarioFilterGroup, task.dataFilters)];
    case "variables":
      return [new VariableCheckBackTest(task.variables)];
  }
};

/** Builds the task's jobs and runs them. The same code runs in a worker or on the main thread. */
export const runBackTestTask = async (task: BackTestTask): Promise<BackTestResults> =>
  BackTestService.runBackTests(buildJobs(task), task.group, task.config);

// ─── errors across the thread boundary ─────────────────────────────────────────

export interface IWireError {
  message: string;
  statusCode?: number;
  stack?: string;
}

/** Keeps a BaseError's status, so a 400 or a Schwab sign-in error reaches the client unchanged. */
export const toWire = (err: unknown): IWireError => {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    message: error.message,
    statusCode: err instanceof BaseError ? err.statusCode : undefined,
    stack: error.stack,
  };
};

export const fromWire = ({ message, statusCode, stack }: IWireError): Error => {
  const error = statusCode ? new BaseError(message, statusCode, true) : new Error(message);
  if (stack) error.stack = stack;
  return error;
};

// ─── messages ──────────────────────────────────────────────────────────────────

/** Main thread → worker. */
export type ToWorker =
  | { type: "run"; task: BackTestTask }
  | { type: "token"; id: number; token?: string; error?: IWireError };

/** Worker → main thread. One task at a time per worker, so results carry no id. */
export type FromWorker =
  | { type: "done"; results: BackTestResults; runtimeMs: number }
  | { type: "failed"; error: IWireError }
  | { type: "token"; id: number; force: boolean };
