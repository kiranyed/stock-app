import { BackTestHelper } from "../../back-testing/back-test-helper";
import { BackTestService } from "../../run/back-test-service";
import { DataHandler } from "../../run/data-handler";
import { HistoricalWarmupService } from "../../run/historical-warmup-service";
import { MemoryType, PeriodType } from "../../shared/constants";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";
import { IInitializedJobData, IStockScreenerJob } from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";

jest.mock("../../back-testing/back-test-helper");
jest.mock("../../run/back-test-service");
jest.mock("../../run/data-handler");
jest.mock("../../shared/utilities/stock-trade");

describe("HistoricalWarmupService", () => {
  let mockJobs: IStockScreenerJob[];
  let mockGroup: IStockGroup;
  let mockSlice: IInitializedJobData;
  let helperInstance: {
    initCandleData: jest.Mock;
    getTestData: jest.Mock;
  };

  beforeEach(() => {
    mockJobs = [{} as IStockScreenerJob];
    mockGroup = { id: 1, name: "Test Group", symbols: ["AAPL"] };
    mockSlice = {
      newNames: {
        [PeriodType.MINUTE]: [],
        [PeriodType.FIVE_MINUTES]: [],
        [PeriodType.TEN_MINUTES]: [],
        [PeriodType.THIRTY_MINUTES]: [],
        [PeriodType.HOUR]: [],
        [PeriodType.DAY]: [],
      },
      newFilterData: {
        [PeriodType.MINUTE]: {},
        [PeriodType.FIVE_MINUTES]: {},
        [PeriodType.TEN_MINUTES]: {},
        [PeriodType.THIRTY_MINUTES]: {},
        [PeriodType.HOUR]: {},
        [PeriodType.DAY]: {},
      },
      newMemories: {
        [PeriodType.MINUTE]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.FIVE_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.TEN_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.THIRTY_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.HOUR]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
        [PeriodType.DAY]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
      },
    };
    helperInstance = {
      initCandleData: jest.fn().mockResolvedValue(undefined),
      getTestData: jest.fn().mockReturnValue({}),
    };

    (BackTestHelper as jest.Mock).mockImplementation(() => helperInstance);
    (BackTestService.iterateThroughCandlesAndRun as jest.Mock).mockImplementation(
      () => {},
    );
    (StockTradeUtil.getEastCoastDate as jest.Mock).mockImplementation(
      (date: Date) => date,
    );
    (DataHandler.adjustMemory as jest.Mock).mockImplementation(() => {});
    (DataHandler.processDataBackTest as jest.Mock).mockImplementation(() => {});
  });

  it("should short-circuit when no day symbols need warming", async () => {
    const result = await HistoricalWarmupService.warmInitializedSlice(
      mockJobs,
      mockGroup,
      mockSlice,
    );

    expect(result).toBe(mockSlice);
    expect(helperInstance.initCandleData).not.toHaveBeenCalled();
    expect(BackTestService.iterateThroughCandlesAndRun).not.toHaveBeenCalled();
  });

  it("should compute the daily warmup range from maxSpace", async () => {
    mockSlice.newNames[PeriodType.DAY] = ["AAPL"];
    mockSlice.newMemories[PeriodType.DAY][MemoryType.PRICE] = {
      AAPL: { space: 20, list: [], lastTime: 0 },
    };

    await HistoricalWarmupService.warmInitializedSlice(
      mockJobs,
      mockGroup,
      mockSlice,
      Date.UTC(2024, 0, 31, 21, 0, 0),
    );

    const [config, periods, symbols] = helperInstance.initCandleData.mock.calls[0];
    expect(config.endTime).toBe(new Date(2024, 0, 30, 15, 59, 0).getTime());
    expect(config.endTime - config.startTime).toBe(33 * 86400000);
    expect(periods).toEqual([PeriodType.DAY]);
    expect(symbols).toEqual(["AAPL"]);
    expect(BackTestService.iterateThroughCandlesAndRun).toHaveBeenCalled();
  });

  it("should move warmup end time to Friday when current day is Monday", async () => {
    mockSlice.newNames[PeriodType.DAY] = ["AAPL"];
    mockSlice.newMemories[PeriodType.DAY][MemoryType.PRICE] = {
      AAPL: { space: 2, list: [], lastTime: 0 },
    };

    await HistoricalWarmupService.warmInitializedSlice(
      mockJobs,
      mockGroup,
      mockSlice,
      Date.UTC(2024, 0, 8, 21, 0, 0),
    );

    const [config] = helperInstance.initCandleData.mock.calls[0];
    expect(config.endTime).toBe(new Date(2024, 0, 5, 15, 59, 0).getTime());
  });
});