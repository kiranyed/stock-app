import { StatusCodes } from "http-status-codes";
import { Response, NextFunction } from "express";
import { checkVariables, getData } from "../../routers/analysis-router";
import { BackTestService } from "../../run/back-test-service";
import { ScreenerJobService } from "../../shared/services/screener-job-service";
import { VariableCheckService } from "../../shared/services/variable-check-service";
import { AuthenticatedRequest } from "../../types/middleware-types";

jest.mock("../../shared/services/screener-job-service");
jest.mock("../../run/back-test-service");
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

      const mockAnalyses = { test: "analysis" };
      const mockGroup = { groupName: "TestGroup" };
      const mockResult = [{ result: "BackTestResult" }];

      (ScreenerJobService.setUpAnalysisBackTest as jest.Mock).mockResolvedValue(
        {
          analyses: mockAnalyses,
          group: mockGroup,
        },
      );
      (BackTestService.runBackTests as jest.Mock).mockReturnValue(mockResult);

      await getData(req as AuthenticatedRequest, res as Response, next);

      expect(ScreenerJobService.setUpAnalysisBackTest).toHaveBeenCalledWith(
        "DAILY",
        { filters: [{ symbol: "AAPL" }], connectors: [] },
        { region: "US" },
        1,
      );
      expect(BackTestService.runBackTests).toHaveBeenCalledWith(
        [mockAnalyses],
        mockGroup,
        {
          analyze: true,
          startTime: "2023-01-01T00:00:00Z",
          endTime: "2023-01-31T23:59:59Z",
        },
      );
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
      (ScreenerJobService.setUpAnalysisBackTest as jest.Mock).mockRejectedValue(
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
