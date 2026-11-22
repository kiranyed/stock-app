import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  createStockGroup,
  deleteGroup,
  getStockGroupNames,
  saveStockGroup,
} from "../../routers/group-router";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { AuthenticatedRequest } from "../../types/middleware-types";

jest.mock("../../shared/services/repos/stock-group-repository");
jest.mock("../../middleware/group-middleware");
jest.mock("../../middleware/error-middleware");

describe("groupRouter", () => {
  let req: Partial<Request> & { headers: { "user-id": string } };
  let res: Partial<Response>;
  let next: NextFunction;
  const userId = "1";

  const userIdParsed = parseInt(userId);

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      headers: {
        "user-id": "1",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("getStockGroupNames", () => {
    it("should return stock group names", async () => {
      const mockRows = [{ name: "Group1" }, { name: "Group2" }];

      (
        StockGroupRepository.getAllStockGroupNames as jest.Mock
      ).mockResolvedValue(mockRows);

      await getStockGroupNames(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(StockGroupRepository.getAllStockGroupNames).toHaveBeenCalledWith(
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockRows);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (
        StockGroupRepository.getAllStockGroupNames as jest.Mock
      ).mockRejectedValue(mockError);

      await getStockGroupNames(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("createStockGroup", () => {
    it("should create a stock group and return the result", async () => {
      req.body = { name: "NewGroup", symbols: ["AAPL"] };

      const mockGroup = { id: "1", symbols: ["AAPL"], name: "NewGroup" };

      (StockGroupRepository.createGroup as jest.Mock).mockResolvedValue([
        undefined,
        [{ "LAST_INSERT_ID()": "1" }],
      ]);

      await createStockGroup(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(StockGroupRepository.createGroup).toHaveBeenCalledWith(
        req.body.name,
        req.body.symbols,
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockGroup);
    });

    it("should call next with the error on failure", async () => {
      req.body = { name: "NewGroup", symbols: ["AAPL"] };
      const mockError = new Error("Test Error");
      (StockGroupRepository.createGroup as jest.Mock).mockRejectedValue(
        mockError,
      );

      await createStockGroup(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });

    it("should format symbols by trimming whitespace and removing line breaks", async () => {
      req.body = {
        name: "NewGroup",
        symbols: ["AAPL\n", " GOOGL\r\n", "MSFT "],
      };

      (StockGroupRepository.createGroup as jest.Mock).mockResolvedValue([
        undefined,
        [{ "LAST_INSERT_ID()": "1" }],
      ]);

      await createStockGroup(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(StockGroupRepository.createGroup).toHaveBeenCalledWith(
        "NewGroup",
        ["AAPL", "GOOGL", "MSFT"],
        userIdParsed,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    });
  });

  describe("updateStockGroup", () => {
    it("should update a stock group and return the result", async () => {
      req.body = { name: "UpdatedGroup", id: "1", symbols: ["AAPL"] };

      const mockGroup = { id: "1", name: "UpdatedGroup", symbols: ["AAPL"] };

      (StockGroupRepository.saveGroup as jest.Mock).mockResolvedValue(
        mockGroup,
      );

      await saveStockGroup(req as Request, res as Response, next);

      expect(StockGroupRepository.saveGroup).toHaveBeenCalledWith(
        req.body.name,
        req.body.symbols,
        req.body.id,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockGroup);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (StockGroupRepository.saveGroup as jest.Mock).mockRejectedValue(
        mockError,
      );

      await saveStockGroup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("deleteStockGroup", () => {
    it("should delete a stock group and return the result", async () => {
      req.params = { id: "1" };

      (StockGroupRepository.deleteGroup as jest.Mock).mockResolvedValue(true);

      await deleteGroup(req as AuthenticatedRequest, res as Response, next);

      expect(StockGroupRepository.deleteGroup).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NO_CONTENT);
      expect(res.json).toHaveBeenCalledWith({});
    });

    it("should call next with the error on failure", async () => {
      req.params = { id: "1" };

      const mockError = new Error("Test Error");
      (StockGroupRepository.deleteGroup as jest.Mock).mockRejectedValue(
        mockError,
      );

      await deleteGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });

    it("should throw Error400 when id is not provided in deleteGroup", async () => {
      req.params = {};

      await deleteGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });
  });
});
