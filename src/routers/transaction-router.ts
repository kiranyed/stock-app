import { Request, Router, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../errors/error-400";
import { requireUserId as userOf } from "../middleware/shared-funcs";
import { parseIds, parseTimestamp } from "../services/parse";
import { TransactionService } from "../services/transaction-service";
import { TransactionKind } from "../shared/services/repos/transaction-repository";

const router = Router();

/** `runId` (one or more) and `pingTime` (only transactions after it) from the query string. */
const parseQuery = (req: Request) => {
  const runIds = parseIds(req.query.runId, "runId");
  if (!runIds.length) throw new Error400("must pass a runId or array of run ids");
  return { runIds, since: parseTimestamp(req.query.pingTime, "pingTime") };
};

const list = (kind: TransactionKind, key: "simTransactions" | "transactions") =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runIds, since } = parseQuery(req);
      res.status(StatusCodes.OK).json({ [key]: await TransactionService.list(userOf(req), kind, runIds, since) });
    } catch (error) {
      next(error);
    }
  };

/** GET /api/transaction/simulation?runId=1&runId=2&pingTime=0 → { simTransactions } */
const getSimulationTransactions = list("simulation", "simTransactions");
router.get("/simulation", getSimulationTransactions);

export { getSimulationTransactions };
export default router;
