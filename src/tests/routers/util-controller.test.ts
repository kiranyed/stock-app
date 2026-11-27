import { Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { EarningsUtil } from "../../shared/utilities/earnings-util";
import { AuthenticatedRequest } from "../../types/middleware-types";
import { storeEarningsList } from "../../routers/util-router";

jest.mock("../../shared/utilities/mass-create-strategies");
jest.mock("../../shared/services/db-api");
jest.mock("../../shared/utilities/earnings-util");
jest.mock("../../shared/utilities/stock-trade");
jest.mock("../../providers/schwab/schwab-client");

describe("utilRouter", () => {
  let req: Partial<AuthenticatedRequest> & {
    query: { day?: string; fileName?: string };
  };
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      query: { day: "true", fileName: "" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("storeEarningsList", () => {
    it("should return earnings list from file name", async () => {
      req.query = { fileName: "testfile.html" };

      const mockSymbols = ["AAPL", "GOOGL"];
      (EarningsUtil.createEarningsLists as jest.Mock).mockImplementation(
        () => {},
      );
      (EarningsUtil.parseHTMLFileFromFileName as jest.Mock).mockResolvedValue(
        mockSymbols,
      );

      await storeEarningsList(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(EarningsUtil.createEarningsLists).toHaveBeenCalled();
      expect(EarningsUtil.parseHTMLFileFromFileName).toHaveBeenCalledWith(
        "testfile.html",
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ symbols: mockSymbols });
    });

    it("should return earnings list from day", async () => {
      req.query = { day: "1" };

      const mockSymbols = ["AAPL", "GOOGL"];
      (EarningsUtil.getEarningsCalendarStocks as jest.Mock).mockResolvedValue(
        mockSymbols,
      );

      await storeEarningsList(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(EarningsUtil.getEarningsCalendarStocks).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ symbols: mockSymbols });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      req.query.day = "true";
      (EarningsUtil.getEarningsCalendarStocks as jest.Mock).mockRejectedValue(
        mockError,
      );

      await storeEarningsList(
        req as AuthenticatedRequest,
        res as Response,
        next,
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
});
