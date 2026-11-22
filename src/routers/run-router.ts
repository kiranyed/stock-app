import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { StrategyType } from "../shared/constants";
import { LiveJobRunner } from "../run/live-job-runner";
import RunRepository from "../shared/services/repos/run-repository";
import {
  validate,
  validateDateRange,
} from "../middleware/strategy-run-middleware";
import { AuthenticatedRequest } from "../types/middleware-types";
import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import { BackTestService } from "../run/back-test-service";
import { ScreenerJobService } from "../shared/services/screener-job-service";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { isString, userIdCheck } from "../middleware/shared-funcs";
import BacktestResultRepository from "../shared/services/repos/backtest-result-repository";
import { IGainTotal } from "../types/back-test-types";

const router = express.Router();
export interface RunRequest extends AuthenticatedRequest {
  query: {
    [key: string]: string | string[];
    groupId: string;
    startTime: string;
    endTime: string;
  };
}

const computeMetrics = (result: IGainTotal) => {
  const trades = result.tradeNum ?? result.gains?.length ?? 0;
  const wins = (result.gains || []).filter((g) => g.gainPercent > 0).length;
  const winRate = trades ? (wins / trades) * 100 : 0;
  const returnPct = (result.total ?? 0) * 100;

  let equity = 1;
  let peak = 1;
  let trough = 1;
  let maxDrawdown = 0;

  (result.gains || []).forEach((g) => {
    equity *= 1 + g.gainPercent / 100;
    peak = Math.max(peak, equity);
    trough = Math.min(trough, equity);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }
  });

  return { trades, wins, winRate, returnPct };
};

/**
 * Runs the back tests for the given strategies and group id.
 * @param req
 * @param res
 * @param next
 * @returns the gains (in percent) of the back tests
 */
const runTests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runStart = Date.now();
    const { strategyId, groupId, startTime, endTime } = req.query;
    if (typeof groupId !== "string") {
      throw new Error400("One group id must be specified");
    }
    if (typeof startTime !== "string" || typeof endTime !== "string") {
      throw new Error400("startTime and endTime must be specified");
    }
    if (typeof strategyId !== "string") {
      if (!Array.isArray(strategyId) || strategyId.some((id) => !isString(id)))
        throw new Error400("invalid strategy id parameter(s)");
    }
    const validStrategyId =
      typeof strategyId === "string" ? strategyId : strategyId.filter(isString);
    const { runs, group } = await ScreenerJobService.setUpStrategyBackTest(
      validStrategyId,
      groupId,
    );
    const minimumPeriod = Math.min(...StrategyUtil.getAllTimePeriods(runs));

    console.log(`Running backtest for strategy ids: ${validStrategyId} with group id: ${groupId} from ${new Date(parseInt(startTime)).toLocaleString()} to ${new Date(parseInt(endTime)).toLocaleString()}`);
    const gains = await BackTestService.runBackTests(runs, group, {
      startTime: parseInt(startTime),
      endTime: parseInt(endTime),
      minimumPeriod,
    });

    const runtimeMs = Date.now() - runStart;
    const startTs = parseInt(startTime);
    const endTs = parseInt(endTime);

    const insertPromises = gains.map((result, idx: number) => {
      if (Array.isArray(result)) {
        return Promise.resolve();
      }
      const run = runs[idx];
      const { trades, winRate, returnPct } = computeMetrics(
        result as IGainTotal,
      );
      return BacktestResultRepository.insert({
        strategyId: run.getConfigId(),
        groupId: group.id,
        strategyName: run.getName(),
        groupName: group.name,
        startTime: startTs,
        endTime: endTs,
        period: run.getPeriod(),
        direction: undefined,
        params: undefined,
        returnPct,
        winRate,
        trades,
        sharpe: undefined,
        dataSource: undefined,
        status: "SUCCESS",
        runtimeMs,
        createdAt: Date.now(),
      });
    });

    const insertResults = await Promise.allSettled(insertPromises);
    const failedInsert = insertResults.find((r) => r.status === "rejected");
    if (failedInsert) {
      console.error("Failed to persist backtest_result", failedInsert.reason);
    }
    console.log(`Backtest completed in ${(runtimeMs / 1000).toFixed(2)} seconds`);
    res.status(StatusCodes.OK).json(gains);
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.error((error as any).stack);
    return next(error);
  }
};

const runRealStrategy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { groupId, strategyId } = req.query;
    if (typeof groupId !== "string") {
      throw new Error400("One group id must be specified");
    }

    if (
      typeof strategyId !== "string" ||
      (Array.isArray(strategyId) && strategyId.some((id) => !isString(id)))
    ) {
      throw new Error400("invalid strategy id parameter(s)");
    }
    const { runs, group } = await ScreenerJobService.setUpStrategyRunsLive(
      strategyId,
      groupId,
      StrategyType.REAL,
    );
    const entities = await LiveJobRunner.getInstance().runJobs(runs, group, StrategyType.REAL);
    res.status(StatusCodes.OK).json({ runs: entities });
  } catch (error) {
    return next(error);
  }
};

const runSimulations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { groupId, strategyId, notify } = req.query;
    if (typeof groupId !== "string") {
      throw new Error400("One group id must be specified");
    }

    if (
      typeof strategyId !== "string" ||
      (Array.isArray(strategyId) && strategyId.some((id) => !isString(id)))
    ) {
      throw new Error400("invalid strategy id parameter(s)");
    }
    const simulationOptions =
      notify === "true" ? { notifyOnEntry: true } : undefined;
    const { runs, group } = await ScreenerJobService.setUpStrategyRunsLive(
      strategyId,
      groupId,
      StrategyType.SIMULATION,
      simulationOptions,
    );
    const entities = await LiveJobRunner.getInstance().runJobs(runs, group);

    res.status(StatusCodes.OK).json({ runs: entities });
  } catch (error) {
    return next(error);
  }
};

const getCurrentSimulations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const simulations = await RunRepository.getCurrentRunningSimulations();
    res.status(StatusCodes.OK).json(simulations);
  } catch (error) {
    return next(error);
  }
};

const getCurrentRealStrategies = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const strategies = await RunRepository.getCurrentRealStrategies();
    res.status(StatusCodes.OK).json(strategies);
  } catch (error) {
    return next(error);
  }
};

const pauseSimulation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    LiveJobRunner.getInstance().pauseStrategy(id);
    await RunRepository.pauseJob(id);
    res.status(StatusCodes.OK).json(`Paused simulation run with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const pauseRealStrategy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    LiveJobRunner.getInstance().pauseStrategy(id);
    await RunRepository.pauseJob(id);
    res.status(StatusCodes.OK).json(`Paused real strategy run with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const resumeSimulation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    LiveJobRunner.getInstance().resumeStrategy(id);
    await RunRepository.resumeJob(id);
    res.status(StatusCodes.OK).json(`Resumed simulation with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const resumeRealStrategy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    LiveJobRunner.getInstance().resumeStrategy(id);
    await RunRepository.resumeJob(id);
    res.status(StatusCodes.OK).json(`Resumed real strategy run with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const endSimulation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    LiveJobRunner.getInstance().endStrategy(id);
    await RunRepository.endJob(id);
    res.status(StatusCodes.OK).json(`Ended simulation with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const endRealStrategy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.body;
    userIdCheck(req);
    LiveJobRunner.getInstance().endStrategy(id);
    await RunRepository.endJob(id);
    res.status(StatusCodes.OK).json(`Ended real strategy run with id: ${id}`);
  } catch (error) {
    return next(error);
  }
};

const getRuns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.query;
    let rows;
    if (typeof id === "string") {
      rows = await RunRepository.getRun(parseInt(id));
    } else if (
      Array.isArray(id) &&
      id.every((item) => typeof item === "string")
    ) {
      rows = await RunRepository.getRuns(id.map((id: string) => parseInt(id)));
    }
    res.status(StatusCodes.OK).json({ arr: rows });
  } catch (error) {
    return next(error);
  }
};

const getRunVars = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { runId } = req.query;
    if (typeof runId !== "string") {
      throw new Error400("runId must be specified");
    }

    const parsedRunId = parseInt(runId, 10);
    if (!Number.isInteger(parsedRunId) || parsedRunId <= 0) {
      throw new Error400("runId must be a positive integer");
    }

    const run = LiveJobRunner.getInstance().getJobByRunId(parsedRunId);
    if (!run) {
      throw new Error404(`No active or paused run found for id ${parsedRunId}`);
    }

    res.status(StatusCodes.OK).json({
      runId: parsedRunId,
      vars: run.getVars(),
    });
  } catch (error) {
    return next(error);
  }
};

const getBacktestResults = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { strategyId, groupId } = req.query;

    if (typeof groupId !== "string") {
      throw new Error400("groupId is required");
    }

    const parsedGroupId = parseInt(groupId, 10);
    if (!Number.isInteger(parsedGroupId) || parsedGroupId <= 0) {
      throw new Error400("groupId must be a positive integer");
    }

    let parsedStrategyIds: number[] | undefined;
    if (typeof strategyId !== "undefined") {
      const rawStrategyIds =
        typeof strategyId === "string"
          ? [strategyId]
          : Array.isArray(strategyId) && strategyId.every(isString)
            ? strategyId
            : undefined;

      if (!rawStrategyIds || !rawStrategyIds.length) {
        throw new Error400("strategyId must be a positive integer");
      }

      parsedStrategyIds = rawStrategyIds.map((id) => parseInt(id, 10));
      if (parsedStrategyIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new Error400("strategyId must be a positive integer");
      }
    }

    const results = await BacktestResultRepository.getCompletedByGroup(
      parsedGroupId,
      parsedStrategyIds,
    );
    res.status(StatusCodes.OK).json(results);
  } catch (error) {
    return next(error);
  }
};

// Register routes
router.patch("/back-test", [validate, validateDateRange], runTests);
router.patch("/real-strategy", validate, runRealStrategy);
router.patch("/simulation", validate, runSimulations);
router.get("/current-simulations", getCurrentSimulations);
router.get("/current-strategies", getCurrentRealStrategies);
router.patch("/pause-simulation", pauseSimulation);
router.patch("/pause-real-strategy", pauseRealStrategy);
router.patch("/resume-simulation", resumeSimulation);
router.patch("/resume-real-strategy", resumeRealStrategy);
router.patch("/end-simulation", endSimulation);
router.patch("/end-real-strategy", endRealStrategy);
router.get("/get-runs", getRuns);
router.get("/vars", getRunVars);
router.get("/back-test-results", getBacktestResults);

export {
  runTests,
  runRealStrategy,
  runSimulations,
  getCurrentSimulations,
  getCurrentRealStrategies,
  pauseSimulation,
  pauseRealStrategy,
  resumeSimulation,
  resumeRealStrategy,
  endSimulation,
  endRealStrategy,
  getRuns,
  getRunVars,
  getBacktestResults,
};

export default router;
