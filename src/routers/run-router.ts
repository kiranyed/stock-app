import express, { Request, Response, NextFunction, RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../errors/error-400";
import { requireUserId as userOf } from "../middleware/shared-funcs";
import { parseId, parseIds, parseTimestamp } from "../services/parse";
import { RunService } from "../services/run-service";

const router = express.Router();

const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  async (req, res, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

/** `strategyId` (one or more) and exactly one `groupId` from the query string. */
const strategiesAndGroup = (req: Request) => {
  const { strategyId, groupId } = req.query;
  const strategyIds = parseIds(strategyId, "strategyId");
  if (!strategyIds.length) throw new Error400("must pass in a strategy id");
  if (groupId === undefined || Array.isArray(groupId)) throw new Error400("must pass in one group id");
  return { strategyIds, groupId: parseId(groupId, "groupId") };
};

/** PATCH /back-test?strategyId=1&strategyId=2&groupId=3&startTime=…&endTime=… → the gains */
const runTests = handle(async (req, res) => {
  const gains = await RunService.backTest(userOf(req), {
    ...strategiesAndGroup(req),
    startTime: parseTimestamp(req.query.startTime, "startTime"),
    endTime: parseTimestamp(req.query.endTime, "endTime"),
  });
  res.status(StatusCodes.OK).json(gains);
});

const start = () =>
  handle(async (req, res) => {
    const runs = await RunService.start(userOf(req), {
      ...strategiesAndGroup(req),
      notifyOnEntry: req.query.notify === "true",
    });
    res.status(StatusCodes.OK).json({ runs });
  });

const listCurrent = () =>
  handle(async (req, res) => {
    res.status(StatusCodes.OK).json(await RunService.listCurrent(userOf(req)));
  });

const pause = () =>
  handle(async (req, res) => {
    const id = parseId(req.body?.id);
    await RunService.pause(userOf(req), id);
    res.status(StatusCodes.OK).json(`Paused simulation run with id: ${id}`);
  });

const resume = () =>
  handle(async (req, res) => {
    const id = parseId(req.body?.id);
    await RunService.resume(userOf(req), id);
    res.status(StatusCodes.OK).json(`Resumed simulation with id: ${id}`);
  });

const end = () =>
  handle(async (req, res) => {
    const id = parseId(req.body?.id);
    await RunService.end(userOf(req), id);
    res.status(StatusCodes.OK).json(`Ended simulation with id: ${id}`);
  });

/** GET /get-runs?id=1&id=2 → { arr: the caller's runs among those ids } */
const getRuns = handle(async (req, res) => {
  res.status(StatusCodes.OK).json({ arr: await RunService.getRuns(userOf(req), parseIds(req.query.id)) });
});

/** GET /vars?runId=1 → the indicator values of a run in progress */
const getRunVars = handle(async (req, res) => {
  const { runId } = req.query;
  if (runId === undefined) throw new Error400("runId must be specified");
  res.status(StatusCodes.OK).json(await RunService.getVars(userOf(req), parseId(runId, "runId")));
});

/** GET /back-test-results?groupId=1[&strategyId=2…] */
const getBacktestResults = handle(async (req, res) => {
  const { groupId, strategyId } = req.query;
  if (groupId === undefined) throw new Error400("groupId is required");
  const strategyIds = strategyId === undefined ? undefined : parseIds(strategyId, "strategyId");
  res
    .status(StatusCodes.OK)
    .json(await RunService.backTestResults(userOf(req), parseId(groupId, "groupId"), strategyIds));
});

const runSimulations = start();
const getCurrentSimulations = listCurrent();
const pauseSimulation = pause();
const resumeSimulation = resume();
const endSimulation = end();

router.patch("/back-test", runTests);
router.patch("/simulation", runSimulations);
router.get("/current-simulations", getCurrentSimulations);
router.patch("/pause-simulation", pauseSimulation);
router.patch("/resume-simulation", resumeSimulation);
router.patch("/end-simulation", endSimulation);
router.get("/get-runs", getRuns);
router.get("/vars", getRunVars);
router.get("/back-test-results", getBacktestResults);

export {
  runTests,
  runSimulations,
  getCurrentSimulations,
  pauseSimulation,
  resumeSimulation,
  endSimulation,
  getRuns,
  getRunVars,
  getBacktestResults,
};

export default router;
