import { Request, Router, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { validateTransactionRequest } from "../middleware/transaction-middleware";
import TransactionRepository from "../shared/services/repos/transaction-repository";
import TransactionMapper from "../mappers/transaction-mapper";

export interface IStrategyTransactionRequest extends Request {
  query: {
    [key: string]: string | string[];
    runId: string | string[];
    pingTime: string;
  };
}
const router = Router();

router.use(validateTransactionRequest);

const getSimulationTransactions = async (
  req: IStrategyTransactionRequest,
  res: Response,
  next: NextFunction,
) => {
  const { pingTime, runId } = req.query;
  try {
    const runIdArr = Array.isArray(runId) ? runId : [runId];
    const simTransactionEntities =
      await TransactionRepository.getTransactionsSimulation(
        runIdArr,
        parseInt(pingTime),
      );
    res.status(StatusCodes.OK).json({
      simTransactions: simTransactionEntities.map((entity) =>
        TransactionMapper.convertEntityToTransaction(entity),
      ),
    });
  } catch (error) {
    return next(error);
  }
};

const getRealTransactions = async (
  req: IStrategyTransactionRequest,
  res: Response,
  next: NextFunction,
) => {
  const { pingTime, runId } = req.query;
  try {
    const runIdArr = Array.isArray(runId) ? runId : [runId];
    const transactionEntities = await TransactionRepository.getTransactionsReal(
      runIdArr,
      parseInt(pingTime),
    );
    res.status(StatusCodes.OK).json({
      transactions: transactionEntities.map((entity) =>
        TransactionMapper.convertEntityToTransaction(entity),
      ),
    });
  } catch (error) {
    return next(error);
  }
};

// Apply middleware and register routes
router.get("/simulation", getSimulationTransactions);
router.get("/real", getRealTransactions);
export { getSimulationTransactions, getRealTransactions };
export default router;
