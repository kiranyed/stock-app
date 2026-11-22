import { Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  endRealStrategy,
  endSimulation,
  getBacktestResults,
  getCurrentRealStrategies,
  getRunVars,
  pauseSimulation,
  resumeSimulation,
  RunRequest,
  runTests,
} from "../../routers/run-router";
import RunRepository from "../../shared/services/repos/run-repository";
import { LiveJobRunner } from "../../run/live-job-runner";
import { ScreenerJobService } from "../../shared/services/screener-job-service";
import { BackTestService } from "../../run/back-test-service";
import { PeriodType } from "../../shared/constants";
import { StrategyUtil } from "../../shared/utilities/strategy-util";
import BacktestResultRepository from "../../shared/services/repos/backtest-result-repository";
jest.mock("../../shared/services/screener-job-service");
jest.mock("../../run/back-test-service");
jest.mock("../../shared/services/repos/run-repository");
jest.mock("../../run/live-job-runner");
jest.mock("../../shared/utilities/strategy-util");
jest.mock("../../shared/services/repos/backtest-result-repository");

describe("runRouter", () => {
  let req: Partial<RunRequest>;
  let res: Partial<Response>;
  let next: NextFunction;
  beforeEach(() => {
    req = {
      body: {},
      query: { groupId: "3", startTime: "", endTime: "" },
      headers: { "user-id": "3" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();

    const mockLiveJobRunner = {
      endStrategy: jest.fn(),
      pauseStrategy: jest.fn(),
      resumeStrategy: jest.fn(),
      getJobByRunId: jest.fn(),
    };

    (LiveJobRunner.getInstance as jest.Mock).mockReturnValue(mockLiveJobRunner);
  });

  describe("runTests", () => {
    it("should run tests and return the result", async () => {
      req.query = {
        strategyId: "1",
        groupId: "1",
        startTime: "1672531200000",
        endTime: "1675132800000",
      };

      const mockRuns = [
        {
          id: "run1",
          getConfigId: () => 1,
          getName: () => "strat",
          getPeriod: () => PeriodType.MINUTE,
        },
        {
          id: "run2",
          getConfigId: () => 2,
          getName: () => "strat2",
          getPeriod: () => PeriodType.MINUTE,
        },
      ];
      const mockGroup = { id: 3, name: "Test Group" };
      const mockGain = {
        gains: [{ gainPercent: 10 }],
        total: 0.1,
        tradeNum: 1,
        avgTrade: 0.1,
        name: "strat",
      };

      (ScreenerJobService.setUpStrategyBackTest as jest.Mock).mockResolvedValue(
        { runs: mockRuns, group: mockGroup },
      );
      (BackTestService.runBackTests as jest.Mock).mockResolvedValue([
        mockGain,
        mockGain,
      ]);
      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.MINUTE,
      ]);
      await runTests(req as RunRequest, res as Response, next);

      expect(StrategyUtil.getAllTimePeriods).toHaveBeenCalledWith(mockRuns);
      expect(ScreenerJobService.setUpStrategyBackTest).toHaveBeenCalledWith(
        "1",
        "1",
      );
      expect(BackTestService.runBackTests).toHaveBeenCalledWith(
        mockRuns,
        mockGroup,
        {
          startTime: 1672531200000,
          endTime: 1675132800000,
          minimumPeriod: PeriodType.MINUTE,
        },
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith([mockGain, mockGain]);
      expect(BacktestResultRepository.insert).toHaveBeenCalledTimes(2);
    });

    it("should handle array of strategyIds", async () => {
      req.query = {
        strategyId: ["1", "2"],
        groupId: "1",
        startTime: "1672531200000",
        endTime: "1675132800000",
      };
      const mockRuns = [
        {
          id: "run1",
          getConfigId: () => 1,
          getName: () => "strat",
          getPeriod: () => PeriodType.MINUTE,
        },
      ];
      const mockGroup = { id: 3 };
      const mockGains = [
        {
          gains: [{ gainPercent: 5 }],
          total: 0.05,
          tradeNum: 1,
          avgTrade: 0.05,
          name: "strat",
        },
      ];

      (ScreenerJobService.setUpStrategyBackTest as jest.Mock).mockResolvedValue(
        { runs: mockRuns, group: mockGroup },
      );
      (BackTestService.runBackTests as jest.Mock).mockResolvedValue(mockGains);
      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.MINUTE,
      ]);

      await runTests(req as RunRequest, res as Response, next);

      expect(ScreenerJobService.setUpStrategyBackTest).toHaveBeenCalledWith(
        ["1", "2"],
        "1",
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockGains);
    });

    it("should throw error if groupId is missing", async () => {
      req.query = {
        strategyId: "1",
        startTime: "1672531200000",
        endTime: "1675132800000",
      } as unknown as RunRequest["query"];
      await runTests(req as RunRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "One group id must be specified" }),
      );
    });

    it("should throw error if startTime or endTime is missing", async () => {
      req.query = {
        strategyId: "1",
        groupId: "1",
        startTime: "1672531200000",
      } as unknown as RunRequest["query"];
      await runTests(req as RunRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "startTime and endTime must be specified",
        }),
      );
    });

    it("should throw error if strategyId is invalid", async () => {
      req.query = {
        strategyId: undefined,
        groupId: "1",
        startTime: "1672531200000",
        endTime: "1675132800000",
      } as unknown as RunRequest["query"];
      await runTests(req as RunRequest, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "invalid strategy id parameter(s)",
        }),
      );
    });

    it("should call next with the error on failure", async () => {
      req.query = {
        strategyId: "1",
        groupId: "1",
        startTime: "2023-01-01",
        endTime: "2023-01-31",
      };

      const mockError = new Error("Test Error");
      (ScreenerJobService.setUpStrategyBackTest as jest.Mock).mockRejectedValue(
        mockError,
      );

      await runTests(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getCurrentRealStrategies", () => {
    it("should return current real strategies", async () => {
      const mockStrategies = [{ id: "strategy1" }, { id: "strategy2" }];

      (RunRepository.getCurrentRealStrategies as jest.Mock).mockResolvedValue(
        mockStrategies,
      );

      await getCurrentRealStrategies(req as RunRequest, res as Response, next);

      expect(RunRepository.getCurrentRealStrategies).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockStrategies);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (RunRepository.getCurrentRealStrategies as jest.Mock).mockRejectedValue(
        mockError,
      );

      await getCurrentRealStrategies(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("pauseJob", () => {
    it("should pause simulation and return the result", async () => {
      req.body = { id: "sim1" };

      const mockResponse = { success: true };
      (
        LiveJobRunner.getInstance().pauseStrategy as jest.Mock
      ).mockResolvedValue(mockResponse);

      (RunRepository.pauseJob as jest.Mock).mockResolvedValue(mockResponse);

      await pauseSimulation(req as RunRequest, res as Response, next);
      expect(LiveJobRunner.getInstance().pauseStrategy).toHaveBeenCalledWith(
        "sim1",
      );

      expect(RunRepository.pauseJob).toHaveBeenCalledWith("sim1");
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        "Paused simulation run with id: sim1",
      );
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (RunRepository.pauseJob as jest.Mock).mockRejectedValue(mockError);
      const mockResponse = { success: true };
      (
        LiveJobRunner.getInstance().pauseStrategy as jest.Mock
      ).mockResolvedValue(mockResponse);

      await pauseSimulation(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("resumeSimulation", () => {
    it("should resume simulation and return the result", async () => {
      req.body = { id: "sim1" };

      const mockResponse = { success: true };
      (
        LiveJobRunner.getInstance().resumeStrategy as jest.Mock
      ).mockResolvedValue(mockResponse);

      (RunRepository.resumeJob as jest.Mock).mockResolvedValue(mockResponse);

      await resumeSimulation(req as RunRequest, res as Response, next);

      expect(RunRepository.resumeJob).toHaveBeenCalledWith("sim1");
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith("Resumed simulation with id: sim1");
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      req.body = { id: "sim1" };
      (RunRepository.resumeJob as jest.Mock).mockRejectedValue(mockError);
      (
        LiveJobRunner.getInstance().resumeStrategy as jest.Mock
      ).mockResolvedValue("");

      await resumeSimulation(req as RunRequest, res as Response, next);
      expect(LiveJobRunner.getInstance().resumeStrategy).toHaveBeenCalledWith(
        "sim1",
      );

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("stopSimulation", () => {
    it("should stop simulation and return the result", async () => {
      req.body = { id: "sim1" };

      const mockResponse = { success: true };
      (LiveJobRunner.getInstance().endStrategy as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      (RunRepository.endJob as jest.Mock).mockResolvedValue(null);

      await endSimulation(req as RunRequest, res as Response, next);
      expect(LiveJobRunner.getInstance().endStrategy).toHaveBeenCalledWith(
        "sim1",
      );

      expect(RunRepository.endJob).toHaveBeenCalledWith("sim1");
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith("Ended simulation with id: sim1");
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (RunRepository.endJob as jest.Mock).mockRejectedValue(mockError);

      await endSimulation(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("endSimulation", () => {
    it("should end simulation and return the result", async () => {
      req.body = { id: "sim1" };

      const mockResponse = "Ended simulation with id: sim1";

      (LiveJobRunner.getInstance().endStrategy as jest.Mock).mockResolvedValue(
        mockResponse,
      );
      (RunRepository.endJob as jest.Mock).mockResolvedValue(null);

      await endSimulation(req as RunRequest, res as Response, next);

      expect(LiveJobRunner.getInstance().endStrategy).toHaveBeenCalledWith(
        "sim1",
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (LiveJobRunner.getInstance().endStrategy as jest.Mock).mockResolvedValue(
        "",
      );
      //const mockResponse = { success: true };

      (RunRepository.endJob as jest.Mock).mockRejectedValue(mockError);

      await endSimulation(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("endRealStrategy", () => {
    it("should end real strategy and return the result", async () => {
      req.body = { id: "strategy1" };

      const mockResponse = "Ended real strategy run with id: strategy1";

      (LiveJobRunner.getInstance().endStrategy as jest.Mock).mockResolvedValue(
        mockResponse,
      );
      (RunRepository.endJob as jest.Mock).mockResolvedValue(null);

      await endRealStrategy(req as RunRequest, res as Response, next);

      expect(LiveJobRunner.getInstance().endStrategy).toHaveBeenCalledWith(
        "strategy1",
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it("should call next with the error on failure", async () => {
      const mockError = new Error("Test Error");
      (LiveJobRunner.getInstance().endStrategy as jest.Mock).mockResolvedValue(
        "",
      );
      (RunRepository.endJob as jest.Mock).mockRejectedValue(mockError);

      await endRealStrategy(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("getBacktestResults", () => {
    it("should return completed backtest results for group", async () => {
      req.query = { groupId: "7" } as unknown as RunRequest["query"];
      const rows = [{ id: 1, groupId: 7 }];
      (
        BacktestResultRepository.getCompletedByGroup as jest.Mock
      ).mockResolvedValue(rows);

      await getBacktestResults(req as RunRequest, res as Response, next);

      expect(BacktestResultRepository.getCompletedByGroup).toHaveBeenCalledWith(
        7,
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(rows);
    });

    it("should return completed backtest results for group and strategy filters", async () => {
      req.query = {
        strategyId: ["5", "8"],
        groupId: "7",
      } as unknown as RunRequest["query"];
      const rows = [
        { id: 1, strategyId: 5, groupId: 7 },
        { id: 2, strategyId: 8, groupId: 7 },
      ];
      (
        BacktestResultRepository.getCompletedByGroup as jest.Mock
      ).mockResolvedValue(rows);

      await getBacktestResults(req as RunRequest, res as Response, next);

      expect(BacktestResultRepository.getCompletedByGroup).toHaveBeenCalledWith(
        7,
        [5, 8],
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(rows);
    });

    it("should validate groupId", async () => {
      req.query = {} as unknown as RunRequest["query"];

      await getBacktestResults(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "groupId is required" }),
      );
    });

    it("should validate strategyId when provided", async () => {
      req.query = {
        groupId: "7",
        strategyId: "abc",
      } as unknown as RunRequest["query"];

      await getBacktestResults(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "strategyId must be a positive integer",
        }),
      );
    });
  });

  describe("getRunVars", () => {
    it("should return vars for an active or paused run", async () => {
      req.query = { runId: "42" } as unknown as RunRequest["query"];
      const vars = {
        percentGain: { AAPL: 1.23 },
        timeSinceEntry: { AAPL: 5 },
      };
      (LiveJobRunner.getInstance().getJobByRunId as jest.Mock).mockReturnValue({
        getVars: () => vars,
      });

      await getRunVars(req as RunRequest, res as Response, next);

      expect(LiveJobRunner.getInstance().getJobByRunId).toHaveBeenCalledWith(42);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ runId: 42, vars });
    });

    it("should validate runId", async () => {
      req.query = { runId: "abc" } as unknown as RunRequest["query"];

      await getRunVars(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "runId must be a positive integer" }),
      );
    });

    it("should return not found when run does not exist", async () => {
      req.query = { runId: "99" } as unknown as RunRequest["query"];
      (LiveJobRunner.getInstance().getJobByRunId as jest.Mock).mockReturnValue(
        undefined,
      );

      await getRunVars(req as RunRequest, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "No active or paused run found for id 99",
        }),
      );
    });
  });
});
