import { LiveMasterJob } from "../../../shared/classes/live-master-job";
import { TradeLogger } from "../../../shared/utilities/trade-logger";
import { ILiveStockScreenerJob } from "../../../types/data-processing-types";
import { StrategySimulation } from "../../../real-time-trading/strategy-simulation";
import { CONSTANTS, MemoryType, PeriodType } from "../../../shared/constants";
import { DataHandler } from "../../../run/data-handler";
import { StrategyUtil } from "../../../shared/utilities/strategy-util";
import { StockTradeUtil } from "../../../shared/utilities/stock-trade";
import { DataRetriever } from "../../../run/data-retriever";
import { IInitializedJobData } from "../../../types/data-processing-types";

jest.mock("../../../shared/services/repos/run-repository");
jest.mock("../../../shared/utilities/trade-logger");
jest.mock("../../../shared/utilities/stock-trade");
jest.mock("../../../shared/utilities/strategy-util");
jest.mock("../../../run/data-handler");
jest.mock("../../../run/data-retriever");
jest.mock("../../../shared/services/trading-api", () => ({
  SchwabAPI: {
    testAccessToken: jest.fn(),
  },
}));

describe("LiveMasterJob", () => {
  let liveMasterJob: LiveMasterJob;
  let mockJob: ILiveStockScreenerJob;

  beforeEach(() => {
    mockJob = {
      getId: jest.fn().mockReturnValue(1),
      run: jest.fn(),
      canRun: jest.fn().mockReturnValue(true),
      getPeriod: jest.fn().mockReturnValue(PeriodType.DAY), // Add this line to mock getPeriod
    } as unknown as jest.Mocked<StrategySimulation>;

    // (StrategySimulation as jest.Mock).mockImplementation(() => mockJob);
    // mockJob = new StrategySimulation({ id: 1, screeners: [], description: '', name: '', period: PeriodType.MINUTE })
    liveMasterJob = new LiveMasterJob([mockJob], {
      id: 1,
      name: "",
      symbols: [],
    });
  });

  describe("prepare", () => {
    it("should prepare the job and return the initialized slice", () => {
      const val = CONSTANTS.PERIODS.reduce(
        (prevVal, curVal) => ({ ...prevVal, [curVal]: {} }),
        {},
      );
      const valArr = CONSTANTS.PERIODS.reduce(
        (prevVal, curVal): Record<string, unknown[]> => ({
          ...prevVal,
          [curVal]: [],
        }),
        {},
      );
      (DataHandler.initializeData as jest.Mock).mockReturnValue([
        valArr,
        val,
        val,
      ]);
      const slice = liveMasterJob.prepare([mockJob]) as IInitializedJobData;

      expect(liveMasterJob.jobs).toContain(mockJob);
      expect(slice).toEqual({
        newNames: valArr,
        newFilterData: val,
        newMemories: val,
      });
    });

    it("should expand existing memory space when a new job needs more history", () => {
      const emptyNames = CONSTANTS.PERIODS.reduce(
        (prevVal, curVal): Record<string, string[]> => ({
          ...prevVal,
          [curVal]: [],
        }),
        {},
      );
      const emptyVars = CONSTANTS.PERIODS.reduce(
        (prevVal, curVal) => ({ ...prevVal, [curVal]: {} }),
        {},
      );
      const currentMemory = {
        [PeriodType.MINUTE]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.FIVE_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.TEN_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.THIRTY_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.HOUR]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.DAY]: {
          [MemoryType.PRICE]: {
            AAPL: { space: 3, list: [10, 11, 12], lastTime: 123 },
          },
          [MemoryType.VOLUME]: {},
        },
      };
      const incomingMemory = {
        [PeriodType.MINUTE]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.FIVE_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.TEN_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.THIRTY_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.HOUR]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.DAY]: {
          [MemoryType.PRICE]: {
            AAPL: { space: 5, list: [], lastTime: 0 },
          },
          [MemoryType.VOLUME]: {},
        },
      };

      (liveMasterJob as unknown as { allMemories: typeof currentMemory }).allMemories = currentMemory;
      (DataHandler.initializeData as jest.Mock).mockReturnValue([
        emptyNames,
        emptyVars,
        incomingMemory,
      ]);

      liveMasterJob.mergeInitializedSlice(
        liveMasterJob.prepare([mockJob]) as IInitializedJobData,
      );

      expect(
        (liveMasterJob as unknown as { allMemories: typeof currentMemory }).allMemories[
          PeriodType.DAY
        ][MemoryType.PRICE].AAPL,
      ).toEqual({
        space: 5,
        list: [NaN, NaN, 10, 11, 12],
        lastTime: 123,
      });
    });
  });

  describe("run", () => {
    it("should run all jobs", async () => {
      liveMasterJob.jobs = [mockJob];
      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.DAY,
      ]);
      StockTradeUtil.getMinutesInDayEastCoast = jest.fn().mockReturnValue(959);
      (DataRetriever.getData as jest.Mock).mockResolvedValue(["test data"]);
      await liveMasterJob.run();

      expect(mockJob.run).toHaveBeenCalled();
    });

    it("should include PeriodType.DAY when time is 3:59 (959 minutes)", async () => {
      liveMasterJob.jobs = [mockJob];
      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.DAY,
      ]);
      jest
        .spyOn(StockTradeUtil, "getMinutesInDayEastCoast")
        .mockReturnValue(959);
      (DataRetriever.getData as jest.Mock).mockClear();
      (DataRetriever.getData as jest.Mock).mockResolvedValue(["test data"]);
      await liveMasterJob.run();

      const calledWith = (DataRetriever.getData as jest.Mock).mock.calls[0][0];
      expect(calledWith).toContain(PeriodType.DAY);
    });
  });

  describe("pause", () => {
    it("should pause all jobs", () => {
      liveMasterJob.jobs = [mockJob];
      liveMasterJob.pause(1);

      expect(liveMasterJob.pausedJobs).toContain(mockJob);
    });
  });

  describe("resume", () => {
    it("should resume all paused jobs", () => {
      liveMasterJob.pausedJobs = [mockJob];
      liveMasterJob.resume(1);

      expect(liveMasterJob.pausedJobs).not.toContain(mockJob);
    });
  });

  describe("end", () => {
    it("should end a specific job", () => {
      liveMasterJob.jobs = [mockJob];
      liveMasterJob.end(1);

      expect(liveMasterJob.jobs).not.toContain(mockJob);
    });
  });

  describe("endAll", () => {
    it("should end all jobs and clear the job lists", () => {
      liveMasterJob.jobs = [mockJob];
      liveMasterJob.endAll();

      expect(TradeLogger.renameStrategyLog).toHaveBeenCalledWith(`Run${1}`);
      expect(TradeLogger.log).toHaveBeenCalledWith("ended all strategies");
      expect(liveMasterJob.jobs).toEqual([]);
      expect(liveMasterJob.pausedJobs).toEqual([]);
    });
  });
});
