import { Response, NextFunction } from "express";
import Error400 from "../../errors/error-400";
import {
  checkIfGroupExists,
  validateGroup,
} from "../../middleware/group-middleware";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { AuthenticatedRequest } from "../../types/middleware-types";

jest.mock("../../shared/services/repos/stock-group-repository");

describe("Group Middleware", () => {
  describe("checkIfGroupExists", () => {
    it("should return true if group exists", async () => {
      const mockRows = [{ id: 1, name: "Test Group" }];
      (StockGroupRepository.getGroupById as jest.Mock).mockResolvedValue(
        mockRows,
      );

      const result = await checkIfGroupExists(1);

      expect(StockGroupRepository.getGroupById).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    it("should return false if group does not exist", async () => {
      (StockGroupRepository.getGroupById as jest.Mock).mockResolvedValue([]);

      const result = await checkIfGroupExists(1);

      expect(StockGroupRepository.getGroupById).toHaveBeenCalledWith(1);
      expect(result).toBe(false);
    });
  });

  describe("validateGroup", () => {
    let req: Partial<AuthenticatedRequest>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        method: "POST",
        body: {
          name: "TestGroup",
          symbols: ["AAPL", "GOOGL"],
          id: 1,
        },
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it("should call next if method is GET or DELETE", async () => {
      req.method = "GET";

      await validateGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should validate group and call next if valid", async () => {
      await validateGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("should throw Error400 if name is not alphanumeric", async () => {
      req.body.name = "Invalid Name!";

      await validateGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        new Error400("name must consist of alphanumeric characters"),
      );
    });

    it("should throw Error400 if symbols is not an array", async () => {
      req.body.symbols = { syms: "AAPL, GOOGL" };

      await validateGroup(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        new Error400("group names must be an array"),
      );
    });
  });
});
