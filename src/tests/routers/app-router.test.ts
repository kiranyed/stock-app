import { StatusCodes } from "http-status-codes";
import { StockDataUtil } from "../../shared/utilities/stock-data-util";
import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../types/middleware-types";
import { getCandleData } from "../../routers/app-router";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";

jest.mock("../../shared/utilities/stock-data-util");
jest.mock("../../shared/services/repos/stock-group-repository");

describe("appRouter", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      headers: {
        "user-id": "1",
      },
      query: {
        symbols: "AAPL",
        earningsTime: "",
        startTime: "",
        endTime: "",
        frequencyMinutes: "5",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("GET /api/stock-data", () => {
    it("should return stock data", async () => {
      const mockStockData = { symbol: "AAPL", price: 150 };
      (StockDataUtil.getCandleData as jest.Mock).mockResolvedValue(
        mockStockData,
      );

      await getCandleData(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ obj: mockStockData });
    });

    it("should return status 400 if there is an error", async () => {
      const mockError = new Error("Bad Request");
      (StockDataUtil.getCandleData as jest.Mock).mockRejectedValue(mockError);

      await getCandleData(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });

    it("should resolve symbols from group id when symbols are missing", async () => {
      req.query = {
        groupId: "42",
        startTime: "1710000000000",
        endTime: "1710500000000",
        frequencyMinutes: "5",
      };
      const mockStockData = { symbol: "MSFT", price: 350 };
      (StockGroupRepository.getGroupById as jest.Mock).mockResolvedValue([
        {
          id: 42,
          name: "Large Cap",
          symbols: '["AAPL","MSFT"]',
          user_id: 1,
        },
      ]);
      (StockDataUtil.getCandleData as jest.Mock).mockResolvedValue(mockStockData);

      await getCandleData(req as Request, res as Response, next);

      expect(StockDataUtil.getCandleData).toHaveBeenCalledWith(
        "AAPL,MSFT",
        "1710000000000",
        "1710500000000",
        5,
        false,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ obj: mockStockData });
    });
  });
});
