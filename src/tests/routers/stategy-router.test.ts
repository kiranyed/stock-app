import { Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  create,
  deleteMultiple,
  deleteStrategy,
  edit,
  getAll,
  getAllNames,
  getByName,
  IDRequest,
  IDsRequest,
  StrategyRequest,
} from "../../routers/strategy-router";
import Error400 from "../../errors/error-400";
import { PeriodType } from "../../shared/constants";
import StrategyMapper from "../../mappers/strategy-mapper";
import StrategyRepository from "../../shared/services/repos/strategy-repository";

jest.mock("../../mappers/strategy-mapper");
jest.mock("../../shared/services/repos/strategy-repository");

describe("strategyRouter", () => {
  let req: Partial<StrategyRequest> & { headers: { "user-id": string } };
  let res: Partial<Response>;
  let next: NextFunction;
  const userId = "2";
  const userIdParsed = parseInt(userId);
  beforeEach(() => {
    req = {
      query: {},
      params: {},
      headers: { "user-id": userId },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("getByName", () => {
    it("should return strategy by name", async () => {
      req.query = { name: "testStrategy" };

      const mockStrategies = [{ id: "1", name: "testStrategy", screeners: "" }];

      (StrategyRepository.getByName as jest.Mock).mockResolvedValue(
        mockStrategies,
      );
      (StrategyMapper.convertEntityToStrategy as jest.Mock).mockReturnValue(
        mockStrategies[0],
      );
      await getByName(req as StrategyRequest, res as Response, next);

      expect(StrategyRepository.getByName).toHaveBeenCalledWith(
        ["testStrategy"],
        2,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ strategies: mockStrategies });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      req.query = { name: "testStrategy" };
      (StrategyRepository.getByName as jest.Mock).mockRejectedValue(mockError);

      await getByName(req as StrategyRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getAll", () => {
    it("should return all strategies", async () => {
      const mockStrategies = [
        { id: "1", name: "strategy1" },
        { id: "2", name: "strategy2" },
      ];

      (StrategyRepository.getAllStrategies as jest.Mock).mockResolvedValue(
        mockStrategies,
      );
      (StrategyMapper.convertEntityToStrategy as jest.Mock).mockImplementation(
        (strategy) => strategy,
      );

      await getAll(req as StrategyRequest, res as Response, next);

      expect(StrategyRepository.getAllStrategies).toHaveBeenCalledWith(
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ strategies: mockStrategies });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (StrategyRepository.getAllStrategies as jest.Mock).mockRejectedValue(
        mockError,
      );

      await getAll(req as StrategyRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getAllNames", () => {
    it("should return all strategy names", async () => {
      const mockNames = [{ name: "strategy1" }, { name: "strategy2" }];

      (StrategyRepository.getAllNames as jest.Mock).mockResolvedValue(
        mockNames,
      );

      await getAllNames(req as StrategyRequest, res as Response, next);

      expect(StrategyRepository.getAllNames).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockNames);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (StrategyRepository.getAllNames as jest.Mock).mockRejectedValue(
        mockError,
      );

      await getAllNames(req as StrategyRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("edit", () => {
    it("should edit a strategy and return the result", async () => {
      req.body = {
        id: 1,
        name: "updatedStrategy",
        screeners: [],
        description: "test",
        period: PeriodType.DAY,
      };

      await edit(req as StrategyRequest, res as Response, next);

      expect(StrategyRepository.updateStrategy).toHaveBeenCalledWith(
        {
          id: 1,
          name: "updatedStrategy",
          screeners: [],
          description: "test",
          period: PeriodType.DAY,
        },
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        msg: "updated strategy: updatedStrategy",
      });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (StrategyRepository.updateStrategy as jest.Mock).mockRejectedValue(
        mockError,
      );

      await edit(req as StrategyRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("create", () => {
    it("should create a strategy and return the result", async () => {
      req.body = {
        id: -1,
        name: "newStrategy",
        screeners: [],
        description: "test",
        period: PeriodType.DAY,
      };

      const mockRow = { insertId: 1 };

      (StrategyRepository.createStrategy as jest.Mock).mockResolvedValue(
        mockRow,
      );

      await create(req as StrategyRequest, res as Response, next);

      expect(StrategyRepository.createStrategy).toHaveBeenCalledWith(
        [
          {
            name: "newStrategy",
            screeners: [],
            description: "test",
            period: PeriodType.DAY,
          },
        ],
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ id: mockRow.insertId });
    });

    it("should call next with the error on failure", async () => {
      // const mockError = new Error('Test Error');
      // (StrategyRepository.createStrategy as jest.Mock).mockRejectedValue(mockError);

      await create(req as StrategyRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete a strategy and return the result", async () => {
      req.params = { id: "1" };

      await deleteStrategy(req as IDRequest, res as Response, next);

      expect(StrategyRepository.deleteStrategy).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ message: "Deleted strategy" });
    });

    it("should throw Error400 if no ID is passed", async () => {
      req.params = {};

      await deleteStrategy(req as IDRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        new Error400("No ID passed for strategy deletion"),
      );
    });

    it("should call next with the error on failure", async () => {
      req.params = { id: "1" };

      const mockError = new Error("Test Error");
      (StrategyRepository.deleteStrategy as jest.Mock).mockRejectedValue(
        mockError,
      );

      await deleteStrategy(req as IDRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("deleteMultiple", () => {
    it("should delete multiple strategies and return the result", async () => {
      req.query = { id: ["1", "2"] };

      await deleteMultiple(req as IDsRequest, res as Response, next);

      expect(StrategyRepository.deleteStrategies).toHaveBeenCalledWith([1, 2]);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ message: "Deleted strategies" });
    });

    it("should throw Error400 if no IDs are passed", async () => {
      req.params = {};

      await deleteMultiple(req as IDsRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        new Error400("No ID(s) passed for strategy deletion"),
      );
    });

    it("should call next with the error on failure", async () => {
      req.query = { id: ["1", "2"] };

      const mockError = new Error("Test Error");
      (StrategyRepository.deleteStrategies as jest.Mock).mockRejectedValue(
        mockError,
      );

      await deleteMultiple(req as IDsRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
});
