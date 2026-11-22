import { StrategyType } from "../../shared/constants";
import { StrategyScheduler } from "../../run/strategy-scheduler";
import MasterJob from "../../shared/classes/master-job";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";
import { SchwabAPI } from "../../shared/services/trading-api";

jest.mock("../../shared/utilities/stock-trade");
jest.mock("../../shared/services/trading-api");

describe("StrategyScheduler", () => {
  let strategyScheduler: StrategyScheduler;
  let mockMasterJob: jest.Mocked<MasterJob>;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    strategyScheduler = new StrategyScheduler(StrategyType.SIMULATION);
    mockMasterJob = {
      run: jest.fn(),
    } as unknown as jest.Mocked<MasterJob>;
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    (StockTradeUtil.getMinutesInDayEastCoastSlow as jest.Mock).mockReturnValue(
      600,
    );
    (SchwabAPI.isMarketOpen as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    strategyScheduler.stopAll();
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  describe("scheduleStrategies", () => {
    it("should schedule strategies", async () => {
      (mockMasterJob.run as jest.Mock).mockResolvedValue(undefined);
      await strategyScheduler.scheduleStrategies(mockMasterJob, 3600000);

      // Advance time past the initial setTimeout
      await jest.advanceTimersByTimeAsync(3600000);

      expect(mockMasterJob.run).toHaveBeenCalled();

      // Advance to trigger the interval call
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockMasterJob.run).toHaveBeenCalledTimes(2);
    });

    it("should catch and log rejected job.run in interval callback", async () => {
      const runError = new Error("interval run failed");
      (mockMasterJob.run as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(runError);

      await strategyScheduler.scheduleStrategies(mockMasterJob, 3600000);

      // Advance time past the initial setTimeout
      await jest.advanceTimersByTimeAsync(3600000);

      // Advance to trigger the interval call
      await jest.advanceTimersByTimeAsync(60000);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Error in startIntervals(), prepareJob(), Error: interval run failed",
        ),
      );
      expect(mockMasterJob.run).toHaveBeenCalledTimes(2);
    });
  });
});
