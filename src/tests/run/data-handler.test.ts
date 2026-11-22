import { CONSTANTS, PeriodType } from "../../shared/constants";
import { DataHandler } from "../../run/data-handler";
import { MemoriesHelper } from "../../run/memories-helper";
import {
  IStockData,
  IStockScreenerJob,
  IAllFilterData,
  IAllMemory,
  IAllStockNames,
} from "../../types/data-processing-types";
import { StrategyUtil } from "../../shared/utilities/strategy-util";
import { FilterVarsHelper } from "../../run/filter-vars-helper";
import { initFilterData, initMemories } from "../../shared/utilities/run-util";

jest.mock("../../shared/utilities/strategy-util");
jest.mock("../../run/memories-helper");
jest.mock("../../run/data-retriever");
jest.mock("../../run/filter-vars-helper");

describe("DataHandler", () => {
  let mockFilterVarsHelper: jest.Mocked<FilterVarsHelper>;
  beforeEach(() => {
    mockFilterVarsHelper = {
      transferVars: jest.fn(),
      initVars: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<FilterVarsHelper>;
    (FilterVarsHelper as jest.Mock).mockImplementation(
      () => mockFilterVarsHelper,
    );
  });

  describe("processData", () => {
    it("should process data", () => {
      const mockData: IStockData[] = [
        { volume: 0, symbol: "AAPL", price: 150, datetime: 123456789 },
      ];
      const mockJobs: IStockScreenerJob[] = [];
      const mockDatetime = 123456789;
      const mockTimePeriods = [PeriodType.DAY, PeriodType.HOUR];
      const mockFilterVars: IAllFilterData = initFilterData();
      const mockMemories: IAllMemory = initMemories();

      DataHandler.processData(
        mockData,
        mockJobs,
        mockDatetime,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
      );
      expect(mockFilterVarsHelper.transferVars).toHaveBeenCalledWith(
        mockJobs,
        mockTimePeriods,
        mockFilterVars,
        mockMemories,
        mockData,
        mockDatetime,
        undefined,
      );
    });
  });

  describe("initializeData", () => {
    it("should initialize data", () => {
      const mockAllCurrentStockNames: IAllStockNames = CONSTANTS.PERIODS.reduce(
        (acc: IAllStockNames, period: PeriodType) => ({ ...acc, [period]: [] }),
        {} as IAllStockNames,
      );
      mockAllCurrentStockNames[PeriodType.DAY] = ["AAPL"];
      mockAllCurrentStockNames[PeriodType.HOUR] = ["GOOGL"];
      const mockJobs: IStockScreenerJob[] = [];
      const mockGroup = { id: 0, name: "", symbols: ["C"] };
      const mockNames: IAllStockNames = CONSTANTS.PERIODS.reduce(
        (acc: IAllStockNames, period: PeriodType) => ({ ...acc, [period]: [] }),
        {} as IAllStockNames,
      );
      mockNames[PeriodType.DAY] = ["AAPL", "C"];
      mockNames[PeriodType.HOUR] = ["GOOGL", "C"];
      const mockVars = {};
      const mockMemories: IAllMemory = initMemories();
      StrategyUtil.getAllTimePeriods = jest
        .fn()
        .mockReturnValue([PeriodType.DAY, PeriodType.HOUR]);
      (MemoriesHelper.initMemories as jest.Mock).mockReturnValue(mockMemories);
      mockFilterVarsHelper.initVars = jest.fn().mockReturnValue({});

      const result = DataHandler.initializeData(
        mockJobs,
        mockGroup,
        mockAllCurrentStockNames,
      );

      expect(result).toEqual([mockNames, mockVars, mockMemories]);
    });
  });

  describe("adjustMemory", () => {
    it("should adjust memory", () => {
      const mockMemories: IAllMemory = initMemories();
      const mockData: IStockData[] = [
        { volume: 0, symbol: "AAPL", price: 150, datetime: 123456789 },
      ];
      const mockTimePeriods = [PeriodType.DAY, PeriodType.HOUR];

      jest.spyOn(MemoriesHelper, "adjustMemory").mockImplementation();

      DataHandler.adjustMemory(mockMemories, mockData, mockTimePeriods);

      expect(MemoriesHelper.adjustMemory).toHaveBeenCalledWith(
        mockData,
        mockTimePeriods,
        mockMemories,
      );
    });
  });
});
