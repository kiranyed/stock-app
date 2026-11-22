import { BackTestMasterJob } from "../../../shared/classes/back-test-master-job";
import { IBackTestScreenerJob } from "../../../types/data-processing-types";
import { CONSTANTS, PeriodType } from "../../../shared/constants";
import { IStockGroup } from "../../../types/entity-types";
import { BackTestHelper } from "../../../back-testing/back-test-helper";
import { StockTradeUtil } from "../../../shared/utilities/stock-trade";
import { StrategyUtil } from "../../../shared/utilities/strategy-util";
import { DataHandler } from "../../../run/data-handler";

jest.mock("../../../analysis/analysis-back-test");
jest.mock("../../../back-testing/back-test-helper");
jest.mock("../../../back-testing/back-test");

jest.mock("../../../shared/services/repos/run-repository");
jest.mock("../../../shared/utilities/trade-logger");
jest.mock("../../../shared/utilities/stock-trade");
jest.mock("../../../shared/utilities/strategy-util");
jest.mock("../../../run/data-handler");

describe("BackTestMasterJob", () => {
  let backTestMasterJob: BackTestMasterJob;
  let mockJob: IBackTestScreenerJob;
  let mockGroup: IStockGroup;
  let mockBackTestHelper: jest.Mocked<BackTestHelper>;
  const eastCoastDateTime = new Date("2025-06-23T09:30:00-04:00").getTime(); // -04:00 is Eastern Daylight Time (EDT)

  beforeEach(() => {
    mockBackTestHelper = {
      getTestData: jest
        .fn()
        .mockReturnValue({
          [PeriodType.MINUTE]: [{ symbol: "AAPL", tradePrice: 1 }],
        }),
      initCandleData: jest.fn(),
    } as unknown as jest.Mocked<BackTestHelper>;
    (BackTestHelper as jest.Mock) = jest
      .fn()
      .mockImplementation(() => mockBackTestHelper);

    mockJob = {
      run: jest.fn(),
      canRun: jest.fn().mockReturnValue(true),
      getTestResults: jest.fn().mockReturnValue({ success: true }),
    } as unknown as jest.Mocked<IBackTestScreenerJob>;

    mockGroup = { id: 0, name: "", symbols: [] };
    const testConfig = { startTime: 1, endTime: 2 };
    backTestMasterJob = new BackTestMasterJob([mockJob], mockGroup, testConfig);
  });

  describe("prepareJob", () => {
    it("should prepare the job", () => {
      backTestMasterJob.prepareJobs();
    });
  });

  describe("run", () => {
    it("should run the back test job and return the results", async () => {
      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.MINUTE,
      ]);
      StockTradeUtil.getMinutesInDayEastCoast = jest.fn().mockReturnValue(1);
      backTestMasterJob.run(eastCoastDateTime, 0);
      expect(mockJob.run).toHaveBeenCalled();
    });

    it("should throw an error if the back test job fails", () => {
      const mockError = new Error("Back test job failed");
      (mockJob.run as jest.Mock).mockImplementation(() => {
        throw mockError;
      });
      expect(() => backTestMasterJob.run(eastCoastDateTime, 0)).toThrow(
        mockError,
      );
    });
  });

  describe("getAllTestResults", () => {
    it("should return all test results", () => {
      const mockResults = { success: true };
      (mockJob.getTestResults as jest.Mock).mockReturnValue(mockResults);

      const result = backTestMasterJob.getAllTestResults();

      expect(result).toEqual([mockResults]);
    });
  });

  describe("handleNewData", () => {
    it("should keep minutesSinceStart aligned across DST for UTC timestamps with day-only periods", () => {
      const march8Utc = Date.UTC(2024, 2, 8, 14, 30, 0); // 9:30 AM EST
      const march11Utc = Date.UTC(2024, 2, 11, 13, 30, 0); // 9:30 AM EDT

      (StrategyUtil.getAllTimePeriods as jest.Mock).mockReturnValue([
        PeriodType.DAY,
      ]);

      const minutesInDayCalls: number[] = [];
      (StockTradeUtil.getMinutesInDayEastCoast as jest.Mock).mockImplementation(
        (date: Date) => {
          const eastCoastDate = new Date(
            date.toLocaleString("en-US", { timeZone: "America/New_York" }),
          );
          const mins =
            eastCoastDate.getHours() * 60 + eastCoastDate.getMinutes();
          minutesInDayCalls.push(mins);
          return mins;
        },
      );

      const processDataSpy = jest
        .spyOn(DataHandler, "processData")
        .mockImplementation(jest.fn());

      backTestMasterJob.handleNewData([
        {
          symbol: "AAPL",
          price: 100,
          open: 99,
          close: 100,
          high: 101,
          low: 98,
          volume: 10,
          datetime: march8Utc,
        },
      ]);
      backTestMasterJob.handleNewData([
        {
          symbol: "AAPL",
          price: 101,
          open: 100,
          close: 101,
          high: 102,
          low: 99,
          volume: 12,
          datetime: march11Utc,
        },
      ]);

      expect(minutesInDayCalls).toEqual([570, 570]);
      expect(minutesInDayCalls[0] - CONSTANTS.BEGIN_TIME).toBe(0);
      expect(minutesInDayCalls[1] - CONSTANTS.BEGIN_TIME).toBe(0);

      expect(processDataSpy).toHaveBeenNthCalledWith(
        1,
        [
          {
            symbol: "AAPL",
            price: 100,
            open: 99,
            close: 100,
            high: 101,
            low: 98,
            volume: 10,
            datetime: march8Utc,
          },
        ],
        [mockJob],
        march8Utc,
        [PeriodType.DAY],
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );
      expect(processDataSpy).toHaveBeenNthCalledWith(
        2,
        [
          {
            symbol: "AAPL",
            price: 101,
            open: 100,
            close: 101,
            high: 102,
            low: 99,
            volume: 12,
            datetime: march11Utc,
          },
        ],
        [mockJob],
        march11Utc,
        [PeriodType.DAY],
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );

      processDataSpy.mockRestore();
    });
  });
});
