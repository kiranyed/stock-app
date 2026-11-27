import { StatusCodes } from "http-status-codes";
import { Response, NextFunction } from "express";
import { checkVariables, getData } from "../../routers/analysis-router";
import { BackTestPool } from "../../run/back-test-pool";
import { ScreenerJobService } from "../../shared/services/screener-job-service";
import { VariableCheckService } from "../../shared/services/variable-check-service";
import { AuthenticatedRequest } from "../../types/middleware-types";

jest.mock("../../shared/services/screener-job-service");
jest.mock("../../run/back-test-pool");
jest.mock("../../shared/services/variable-check-service");

describe("analysisRouter", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
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

  describe("runAnalysis", () => {
    it("should run analysis and return the result", async () => {
      req.body = {
        scenarioFilters: [{ symbol: "AAPL" }],
        period: "DAILY",
        startTime: "2023-01-01T00:00:00Z",
        endTime: "2023-01-31T23:59:59Z",
        groupId: 1,
        dataFilters: { region: "US" },
      };

      const mockGroup = { groupName: "TestGroup" };
      const mockResult = [{ result: "BackTestResult" }];

      (ScreenerJobService.getOwnedGroup as jest.Mock).mockResolvedValue(mockGroup);
      (BackTestPool.run as jest.Mock).mockResolvedValue({ results: mockResult, runtimeMs: 1 });

      await getData(req as AuthenticatedRequest, res as Response, next);

      expect(ScreenerJobService.getOwnedGroup).toHaveBeenCalledWith(1, 1);
      expect(BackTestPool.run).toHaveBeenCalledWith(1, {
        kind: "analysis",
        period: "DAILY",
        scenarioFilterGroup: { filters: [{ symbol: "AAPL" }], connectors: [] },
        dataFilters: { region: "US" },
        group: mockGroup,
        config: {
          analyze: true,
          startTime: "2023-01-01T00:00:00Z",
          endTime: "2023-01-31T23:59:59Z",
        },
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ analysisData: mockResult[0] });
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      req.body = {
        scenarioFilters: [{ symbol: "AAPL" }],
        period: "DAILY",
        startTime: "2023-01-01T00:00:00Z",
        endTime: "2023-01-31T23:59:59Z",
        groupId: 1,
        dataFilters: { region: "US" },
      };
      (ScreenerJobService.getOwnedGroup as jest.Mock).mockRejectedValue(
        mockError,
      );

      await getData(req as AuthenticatedRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("checkVariables", () => {
    it("should return variable check rows", async () => {
      req.body = {
        groupId: 10,
        variables: [{ varName: "percentchange", timeAgo: "10" }],
      };

      const mockResponse = {
        variables: ["percentchange10"],
        rows: [{ symbol: "AAPL", time: 123, percentchange10: 2.3 }],
      };

      (
        VariableCheckService.getVariableValuesForGroup as jest.Mock
      ).mockResolvedValue(mockResponse);

      await checkVariables(req as AuthenticatedRequest, res as Response, next);

      expect(VariableCheckService.getVariableValuesForGroup).toHaveBeenCalledWith(
        1,
        10,
        [{ varName: "percentchange", timeAgo: "10" }],
        undefined,
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it("should pass service error to next", async () => {
      req.body = {
        groupId: 10,
        variables: [{ varName: "percentchange", timeAgo: "10" }],
      };
      const mockError = new Error("variable check failed");
      (
        VariableCheckService.getVariableValuesForGroup as jest.Mock
      ).mockRejectedValue(mockError);

      await checkVariables(req as AuthenticatedRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
});
