import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  getRealTransactions,
  getSimulationTransactions,
  IStrategyTransactionRequest,
} from "../../routers/transaction-router";
import TransactionRepository from "../../shared/services/repos/transaction-repository";
import TransactionMapper from "../../mappers/transaction-mapper";

jest.mock("../../shared/services/repos/transaction-repository");
jest.mock("../../mappers/transaction-mapper");

describe("transactionRouter", () => {
  let req: Partial<Request> & { query: { runId: string; pingTime: string } };
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      query: {
        runId: "1",
        pingTime: "1234123",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("getSimulationTransactions", () => {
    it("should return simulation transactions", async () => {
      const mockEntities = [{ id: 1 }, { id: 2 }];
      const mockTransactions = [
        { id: 1, transaction: "test" },
        { id: 2, transaction: "test" },
      ];

      (
        TransactionRepository.getTransactionsSimulation as jest.Mock
      ).mockResolvedValue(mockEntities);
      (
        TransactionMapper.convertEntityToTransaction as jest.Mock
      ).mockImplementation((entity) =>
        mockTransactions.find((t) => t.id === entity.id),
      );

      await getSimulationTransactions(
        req as IStrategyTransactionRequest,
        res as Response,
        next,
      );

      expect(
        TransactionRepository.getTransactionsSimulation,
      ).toHaveBeenCalledWith([req.query.runId], parseInt(req.query.pingTime));
      expect(
        TransactionMapper.convertEntityToTransaction,
      ).toHaveBeenCalledTimes(mockEntities.length);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        simTransactions: mockTransactions,
      });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (
        TransactionRepository.getTransactionsSimulation as jest.Mock
      ).mockRejectedValue(mockError);

      await getSimulationTransactions(
        req as IStrategyTransactionRequest,
        res as Response,
        next,
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getRealTransactions", () => {
    it("should return real transactions", async () => {
      const mockEntities = [{ id: 1 }, { id: 2 }];
      const mockTransactions = [
        { id: 1, transaction: "test" },
        { id: 2, transaction: "test" },
      ];
      (
        TransactionRepository.getTransactionsReal as jest.Mock
      ).mockResolvedValue(mockEntities);
      (
        TransactionMapper.convertEntityToTransaction as jest.Mock
      ).mockImplementation((entity) =>
        mockTransactions.find((t) => t.id === entity.id),
      );

      await getRealTransactions(
        req as IStrategyTransactionRequest,
        res as Response,
        next,
      );

      expect(TransactionRepository.getTransactionsReal).toHaveBeenCalledWith(
        [req.query.runId],
        parseInt(req.query.pingTime),
      );
      expect(
        TransactionMapper.convertEntityToTransaction,
      ).toHaveBeenCalledTimes(mockEntities.length * 2); // 2 calls in the getSimulationTransactions test
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ transactions: mockTransactions });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (
        TransactionRepository.getTransactionsReal as jest.Mock
      ).mockRejectedValue(mockError);

      await getRealTransactions(
        req as IStrategyTransactionRequest,
        res as Response,
        next,
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
});
