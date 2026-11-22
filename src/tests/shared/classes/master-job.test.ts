import { PeriodType } from "../../../shared/constants";
import { BackTestMasterJob } from "../../../shared/classes/back-test-master-job";
import {
  IBackTestScreenerJob,
  IStockDataBackTest,
} from "../../../types/data-processing-types";
import { IStockGroup } from "../../../types/entity-types";
import { StockTradeUtil } from "../../../shared/utilities/stock-trade";

jest.mock("../../../shared/utilities/stock-trade");

describe("MasterJob", () => {
  let masterJob: BackTestMasterJob;
  let mockJob: IBackTestScreenerJob;
  let mockGroup: IStockGroup;

  beforeEach(() => {
    mockJob = {
      run: jest.fn(),
      canRun: jest.fn().mockReturnValue(true),
      getTestResults: jest.fn().mockReturnValue({}),
      getName: jest.fn().mockReturnValue("test-job"),
      getPeriod: jest.fn().mockReturnValue(PeriodType.DAY),
      getAdditionalPeriods: jest.fn().mockReturnValue([]),
      getCrossPeriodVars: jest.fn().mockReturnValue({}),
      getVars: jest.fn().mockReturnValue({}),
      getAllVariables: jest.fn().mockReturnValue([]),
      getConfigId: jest.fn().mockReturnValue(1),
    } as unknown as IBackTestScreenerJob;
    mockGroup = { id: 0, name: "", symbols: [] };
    const testConfig = { startTime: 1, endTime: 2 };
    masterJob = new BackTestMasterJob([mockJob], mockGroup, testConfig);

    StockTradeUtil.getEastCoastDate = jest.fn((date: Date) => {
      return new Date(
        date.toLocaleString("en-US", { timeZone: "America/New_York" }),
      );
    }) as unknown as typeof StockTradeUtil.getEastCoastDate;
    StockTradeUtil.getMinutesInDay = jest.fn((date: Date) => {
      return date.getHours() * 60 + date.getMinutes();
    }) as unknown as typeof StockTradeUtil.getMinutesInDay;
  });

  describe("finishJob", () => {
    it("should run jobs with minutesSinceStart = 0 before DST (March 8, 2024)", () => {
      const march8Utc = Date.UTC(2024, 2, 8, 14, 30, 0); // 9:30 AM EST
      const mockData: IStockDataBackTest[] = [
        {
          open: 0,
          high: 0,
          close: 0,
          low: 0,
          volume: 0,
          symbol: "AAPL",
          price: 150,
          datetime: march8Utc,
        },
      ];

      masterJob.finishJob(mockData);

      expect(mockJob.canRun).toHaveBeenCalledWith(0);
      expect(mockJob.run).toHaveBeenCalledWith(march8Utc, mockData);
      expect(StockTradeUtil.getEastCoastDate).toHaveBeenCalledWith(
        new Date(march8Utc),
      );
      expect(StockTradeUtil.getMinutesInDay).toHaveBeenCalled();
    });

    it("should run jobs with minutesSinceStart = 0 after DST (March 11, 2024)", () => {
      const march11Utc = Date.UTC(2024, 2, 11, 13, 30, 0); // 9:30 AM EDT
      const mockData: IStockDataBackTest[] = [
        {
          open: 0,
          high: 0,
          close: 0,
          low: 0,
          volume: 0,
          symbol: "AAPL",
          price: 151,
          datetime: march11Utc,
        },
      ];

      masterJob.finishJob(mockData);

      expect(mockJob.canRun).toHaveBeenCalledWith(0);
      expect(mockJob.run).toHaveBeenCalledWith(march11Utc, mockData);
      expect(StockTradeUtil.getEastCoastDate).toHaveBeenCalledWith(
        new Date(march11Utc),
      );
      expect(StockTradeUtil.getMinutesInDay).toHaveBeenCalled();
    });
  });
});
