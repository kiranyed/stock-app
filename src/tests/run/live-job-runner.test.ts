import { LiveJobRunner } from "../../run/live-job-runner";
import { StrategyScheduler } from "../../run/strategy-scheduler";
import { LiveMasterJob } from "../../shared/classes/live-master-job";
import RunRepository from "../../shared/services/repos/run-repository";
import {
  IInitializedJobData,
  ILiveStockScreenerJob,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { HistoricalWarmupService } from "../../run/historical-warmup-service";

jest.mock("../../shared/services/repos/transaction-repository");
jest.mock("../../shared/services/db-api");
jest.mock("../../shared/classes/live-master-job");
jest.mock("../../shared/classes/master-job");
jest.mock("../../run/strategy-scheduler");
jest.mock("../../run/data-retriever");
jest.mock("../../shared/services/repos/run-repository");
jest.mock("../../run/historical-warmup-service");

describe("LiveJobRunner", () => {
  let liveJobRunner: LiveJobRunner;
  let mockJob: jest.Mocked<ILiveStockScreenerJob>;
  let mockMasterJob: jest.Mocked<LiveMasterJob>;
  let mockGroup: IStockGroup;
  let mockScheduler: jest.Mocked<StrategyScheduler>;
  let mockSlice: IInitializedJobData;

  beforeEach(() => {
    mockGroup = { id: 1, name: "Test Group", symbols: ["AAPL", "GOOGL"] };
    mockJob = {
      getId: jest.fn().mockReturnValue(1),
      setId: jest.fn(),
      getConfigId: jest.fn().mockReturnValue(2),
      connectors: [],
      getFilters: jest
        .fn()
        .mockReturnValue([{ varName: "test", operator: "<", compareVal: "3" }]),
      run: jest.fn(),
    } as unknown as jest.Mocked<ILiveStockScreenerJob>;
    mockSlice = {
      newNames: {} as IInitializedJobData["newNames"],
      newFilterData: {} as IInitializedJobData["newFilterData"],
      newMemories: {} as IInitializedJobData["newMemories"],
    };

    mockMasterJob = {
      isInitialized: jest.fn().mockReturnValue(true),
      run: jest.fn(),
      prepare: jest.fn().mockReturnValue(mockSlice),
      mergeInitializedSlice: jest.fn(),
      addJobs: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      end: jest.fn(),
    } as unknown as jest.Mocked<LiveMasterJob>;
    (LiveMasterJob as jest.Mock).mockImplementation(() => mockMasterJob);

    mockScheduler = {
      scheduleStrategies: jest.fn(),
    } as unknown as jest.Mocked<StrategyScheduler>;
    (StrategyScheduler as jest.Mock).mockImplementation(() => mockScheduler);
    (
      HistoricalWarmupService.warmInitializedSlice as jest.Mock
    ).mockResolvedValue(mockSlice);

    liveJobRunner = LiveJobRunner.getInstance();

    (RunRepository.createSimulationRuns as jest.Mock).mockResolvedValue([
      { id: 1, strategy_id: 2 },
    ]);
  });

  describe("runJobs", () => {
    it("should run jobs and update simulation run status", async () => {
      await liveJobRunner.runJobs([mockJob], mockGroup);

      expect(RunRepository.createSimulationRuns).toHaveBeenCalled();
      expect(LiveMasterJob).toHaveBeenCalled();
      expect(HistoricalWarmupService.warmInitializedSlice).toHaveBeenCalledWith(
        [mockJob],
        mockGroup,
        mockSlice,
      );
    });

    it("should throw an error if updating simulation run status fails", async () => {
      const mockError = new Error("Create failed");
      (RunRepository.createSimulationRuns as jest.Mock).mockRejectedValue(
        mockError,
      );

      await expect(liveJobRunner.runJobs([mockJob], mockGroup)).rejects.toThrow(
        mockError,
      );
    });
  });
});
