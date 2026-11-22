import StrategyRepository from "../../shared/services/repos/strategy-repository";
import Error400 from "../../errors/error-400";
import { AuthenticatedRequest } from "../../types/middleware-types";
import { Response, NextFunction } from "express";
import {
  validateStrategy,
  strategiesExist,
} from "../../middleware/strategy-middleware";

jest.mock("../../shared/services/repos/strategy-repository");

describe("Strategy Middleware", () => {
  describe("validateStrategy", () => {
    let req: Partial<AuthenticatedRequest>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        method: "POST",
        body: {
          screeners: [
            {
              buySellFilters: {},
              shortCoverFilters: {},
            },
          ],
        },
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it("should call next if method is GET, OPTIONS, or DELETE", () => {
      req.method = "GET";

      validateStrategy(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should validate strategy and call next if valid", () => {
      req.body = {
        period: 60,
        name: "test",
        description: "testdescription",
        screeners: [
          {
            buySellFilters: {
              enter: {
                filters: [
                  {
                    varName: "percentchange",
                    timeAgo: "1",
                    compareVal: "1",
                    operator: ">",
                  },
                ],
                connectors: ["AND"],
              },
              exit: {
                filters: [
                  {
                    varName: "percentchange",
                    timeAgo: "2",
                    compareVal: "3",
                    operator: "<",
                  },
                ],
                connctors: ["OR"],
              },
            },
          },
        ],
      };

      validateStrategy(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should throw Error400 if strategy is invalid", () => {
      req.body = { invalid: "strategy" };

      expect(() => {
        validateStrategy(req as AuthenticatedRequest, res as Response, next);
      }).toThrow(Error400);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("strategiesExist", () => {
    it("should return true if strategies exist", async () => {
      (StrategyRepository.checkStrategiesExist as jest.Mock).mockResolvedValue(
        2,
      );

      const result = await strategiesExist(["1", "2"]);

      expect(StrategyRepository.checkStrategiesExist).toHaveBeenCalledWith([
        "1",
        "2",
      ]);
      expect(result).toBe(2);
    });

    it("should return false if strategies do not exist", async () => {
      (StrategyRepository.checkStrategiesExist as jest.Mock).mockResolvedValue(
        0,
      );

      const result = await strategiesExist(["1", "2"]);

      expect(StrategyRepository.checkStrategiesExist).toHaveBeenCalledWith([
        "1",
        "2",
      ]);
      expect(result).toBe(0);
    });
  });
});
