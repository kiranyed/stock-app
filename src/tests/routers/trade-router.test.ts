import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { SchwabAPI } from "../../shared/services/trading-api";
import { IOrder, IPosition } from "../../types/external-data-types";
import { AccountType } from "../../shared/enums";
import StockInfoRepository from "../../shared/services/repos/stock-info-repository";
import {
  makeOrders,
  getAccountPositions,
  getOrders,
  optionsTrade,
} from "../../routers/trade-router";

jest.mock("../../shared/services/trading-api");
jest.mock("../../shared/services/repos/stock-info-repository");
jest.mock("../../middleware/shared-funcs");

describe("tradeRouter", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      query: { accountType: AccountType.REGULAR },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("makeOrders", () => {
    it("should make orders and return the result", async () => {
      req.body = {
        orders: [{ symbol: "AAPL", quantity: 10, price: 150 }],
      };

      (SchwabAPI.placeOrder as jest.Mock).mockResolvedValue("12345");
      (SchwabAPI.getOrder as jest.Mock).mockResolvedValue({
        orderId: "12345",
        status: "FILLED",
      });

      await makeOrders(req as Request, res as Response, next);

      expect(SchwabAPI.placeOrder).toHaveBeenCalledWith(
        req.body.orders[0],
        AccountType.REGULAR,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith({ message: "success" });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      req.body = {
        orders: [{ symbol: "AAPL", quantity: 10, price: 150 }],
      };
      (SchwabAPI.placeOrder as jest.Mock).mockRejectedValue(mockError);

      await makeOrders(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getAccountPositions", () => {
    it("should return positions", async () => {
      const mockPositions: IPosition[] = [
        {
          shortQuantity: 0,
          longQuantity: 1,
          averagePrice: 150,
          currentDayProfitLoss: 10,
          currentDayProfitLossPercentage: 5,
          settledLongQuantity: 1,
          settledShortQuantity: 0,
          instrument: { symbol: "AAPL", assetType: "EQUITY", cusip: "037833100", netChange: 1.5 },
          marketValue: 150,
          maintenanceRequirement: 0,
          averageLongPrice: 150,
          taxLotAverageLongPrice: 150,
          longOpenProfitLoss: 10,
          previousSessionLongQuantity: 1,
          currentDayCost: 0,
        },
      ];
      (SchwabAPI.getStocks as jest.Mock).mockResolvedValue([
        { symbol: "AAPL", labels: "tech" },
      ]);
      (SchwabAPI.getAccountPositions as jest.Mock).mockResolvedValue(
        mockPositions,
      );
      (StockInfoRepository.getStockInfo as jest.Mock).mockResolvedValue([
        { symbol: "AAPL", labels: "tech" },
      ]);
      await getAccountPositions(req as Request, res as Response, next);

      expect(SchwabAPI.getAccountPositions).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        positions: mockPositions.map((position) => ({
          ...position,
          labels: "tech",
          symbol: position.instrument.symbol,
        })),
      });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (SchwabAPI.getAccountPositions as jest.Mock).mockRejectedValue(mockError);

      await getAccountPositions(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getPendingOrders", () => {
    it("should return pending orders", async () => {
      const mockPendingOrders: IOrder[] = [
        {
          symbol: "AAPL",
          orderType: "BUY",
          marketOrder: false,
          shares: 10,
          price: 150,
        },
      ];

      (SchwabAPI.getOrders as jest.Mock).mockResolvedValue(mockPendingOrders);

      await getOrders(req as Request, res as Response, next);

      expect(SchwabAPI.getOrders).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ orders: mockPendingOrders });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (SchwabAPI.getOrders as jest.Mock).mockRejectedValue(mockError);

      await getOrders(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("optionsTrade", () => {
    it("should execute options trade and return the result", async () => {
      req.body = {
        symbol: "AAPL",
        weeklies: ["atm"],
        quantity: 2,
        marketOrder: false,
        limitPrice: 2610,
        contract: {
          symbol: "AAPL",
          strike: 150,
          expiry: "2023-12-31",
          type: "CALL",
        },
      };

      // TODO make this a constant somewhere
      const timeFrames = [
        "weeklies",
        "shortTerm",
        "midTerm",
        "shortTerm",
        "leaps",
      ];
      let tradeNum = 0;
      for (const timeFrame of timeFrames) {
        const strikeTypes = req.body[timeFrame];
        if (strikeTypes) {
          tradeNum += strikeTypes.length;
        }
      }

      (SchwabAPI.getOptionsChains as jest.Mock).mockResolvedValue({
        underlyingPrice: 14.32,
        callExpDateMap: {
          "2023-12-31": {
            "10.0": [{ bid: 3.4, ask: 3.7, strikePrice: 10, symbol: "AAPL_1231C10" }],
            "20.0": [{ bid: 4, ask: 5, strikePrice: 20, symbol: "AAPL_1231C20" }],
          },
          "2024-12-31": {
            "10.0": [{ bid: 1.5, ask: 1.8, strikePrice: 10, symbol: "AAPL_2024C10" }],
            "30.0": [{ bid: 2, ask: 3, strikePrice: 30, symbol: "AAPL_2024C30" }],
          },
        },
        symbol: "AAPL",
        strike: 150,
        expiry: "2023-12-31",
        type: "CALL",
      });

      (SchwabAPI.placeOrder as jest.Mock).mockResolvedValue("67890");
      (SchwabAPI.getOrder as jest.Mock).mockResolvedValue({
        orderId: "67890",
        status: "FILLED",
      });

      await optionsTrade(req as Request, res as Response, next);

      expect(SchwabAPI.placeOrder).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Placed ${tradeNum} options order(s)`,
        }),
      );
      expect(next).not.toHaveBeenCalled(); // Ensure no errors occurred
    });

    it("should call next with the error on failure", async () => {
      req.body = {
        symbol: "AAPL",
        weeklies: ["atm"],
        quantity: 2,
        marketOrder: false,
        limitPrice: 2610,
        contract: {
          symbol: "AAPL",
          strike: 150,
          expiry: "2024-12-31",
          type: "CALL",
        },
      };

      const mockError = new Error("Test Error");

      (SchwabAPI.getOptionsChains as jest.Mock).mockResolvedValue({
        underlyingPrice: 14.32,
        callExpDateMap: {
          "2023-12-31": {
            "10.0": [{ bid: 3.4, ask: 3.7, strikePrice: 10, symbol: "AAPL_1231C10" }],
            "20.0": [{ bid: 4, ask: 5, strikePrice: 20, symbol: "AAPL_1231C20" }],
          },
          "2024-12-31": {
            "10.0": [{ bid: 1.5, ask: 1.8, strikePrice: 10, symbol: "AAPL_2024C10" }],
            "30.0": [{ bid: 2, ask: 3, strikePrice: 30, symbol: "AAPL_2024C30" }],
          },
        },
        symbol: "AAPL",
        strike: 150,
        expiry: "2023-12-31",
        type: "CALL",
      });

      (SchwabAPI.placeOrder as jest.Mock).mockRejectedValueOnce(
        mockError,
      );

      next = jest.fn(); // Ensure next is mocked properly

      await optionsTrade(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
      expect(res.json).not.toHaveBeenCalled(); // Ensure response wasn't sent
    });
  });
});
