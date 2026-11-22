import { Request, Response, NextFunction } from "express";
import Error400 from "../../errors/error-400";
import { validateDateRange } from "../../middleware/strategy-run-middleware";
import { AuthenticatedRequest } from "../../types/middleware-types";

describe("strategy-run-middleware", () => {
  describe("validateDateRange", () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        query: {},
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it("should call next if startTime and endTime are valid numbers", () => {
      req.query = {
        startTime: "1622505600",
        endTime: "1622592000",
      };

      validateDateRange(req as AuthenticatedRequest, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("should throw Error400 if startTime is not a number", () => {
      req.query = {
        startTime: "invalid",
        endTime: "1622592000",
      };

      validateDateRange(req as AuthenticatedRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        new Error400("startTime must be a number"),
      );
    });

    it("should throw Error400 if endTime is not a number", () => {
      req.query = {
        startTime: "1622505600",
        endTime: "invalid",
      };

      validateDateRange(req as AuthenticatedRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        new Error400("endTime must be a number"),
      );
    });

    it("should throw Error400 if startTime is greater than endTime", () => {
      req.query = {
        startTime: "1622592000",
        endTime: "1622505600",
      };

      validateDateRange(req as AuthenticatedRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        new Error400("startTime must be before endTime"),
      );
    });
  });
});
