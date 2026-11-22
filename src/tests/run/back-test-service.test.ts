import { BackTestService } from "../../run/back-test-service";
import { BackTestMasterJob } from "../../shared/classes/back-test-master-job";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";
import { ITestConfig } from "../../types/back-test-types";
import { IBackTestScreenerJob, IJob } from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";

type BackTestServiceWithIteration = typeof BackTestService & {
  iterateThroughCandlesAndRun(job: IJob, config: ITestConfig): void;
};

jest.mock("../../shared/classes/back-test-master-job");

describe("BackTestService", () => {
  describe("runBackTests", () => {
    let tests: IBackTestScreenerJob[];
    let mockBackTestMasterJob: jest.Mocked<BackTestMasterJob>;
    let group: IStockGroup;
    let config: ITestConfig;

    beforeEach(() => {
      tests = [
        {
          run: jest.fn(),
          getTestResults: jest.fn(),
          getPeriod: jest.fn(),
          getVars: jest.fn(),
          getAllVariables: jest.fn(),
          canRun: jest.fn(),
          getConfigId: jest.fn(),
          getAdditionalPeriods: jest.fn(() => []),
          getCrossPeriodVars: jest.fn(),
          getName: jest.fn(() => "Test Job"),
        },
      ];

      group = {
        id: 1,
        name: "Test Group",
        symbols: ["AAPL", "GOOGL"],
      };

      config = {
        startTime: 1622505600,
        endTime: 1622592000,
      };

      mockBackTestMasterJob = {
        getAllTestResults: jest.fn().mockReturnValue(["gainz"]),
        prepare: jest.fn(),
        prepareJobs: jest.fn(),
        run: jest.fn(),
      } as unknown as jest.Mocked<BackTestMasterJob>;
      (BackTestMasterJob as jest.Mock).mockImplementation(
        () => mockBackTestMasterJob,
      );
    });

    it("should run back tests for each job", async () => {
      await BackTestService.runBackTests(tests, group, config);

      expect(BackTestMasterJob).toHaveBeenCalledTimes(1);
      expect(mockBackTestMasterJob.prepareJobs).toHaveBeenCalledTimes(1);
      expect(mockBackTestMasterJob.getAllTestResults).toHaveBeenCalledTimes(1);
      expect(mockBackTestMasterJob.run).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      const error = new Error("Test error");
      (mockBackTestMasterJob.run as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await expect(
        BackTestService.runBackTests(tests, group, config),
      ).rejects.toThrow("Test error");
    });
  });

  describe("iterateThroughCandlesAndRun", () => {
    it("normalizes the start time to the minute before computing offsets", () => {
      const computeOffsetSpy = jest
        .spyOn(StockTradeUtil, "computeOffset")
        .mockReturnValue(0);
      const startWithSeconds = Date.parse("2025-03-20T13:45:37.512Z");
      const normalizedStart = startWithSeconds - (startWithSeconds % 60000);

      const fakeJob = {
        run: jest.fn(),
      } as unknown as IJob;

      const config: ITestConfig = {
        startTime: startWithSeconds,
        endTime: startWithSeconds + 10 * 60 * 1000,
      };

      (
        BackTestService as BackTestServiceWithIteration
      ).iterateThroughCandlesAndRun(fakeJob, config);

      expect(computeOffsetSpy).toHaveBeenCalledWith(normalizedStart);
      computeOffsetSpy.mockRestore();
    });
  });
});
