import { AnalysisBackTest } from "../../analysis/analysis-back-test";
import { PeriodType } from "../../shared/constants";
import { IFilterGroup, IFilter } from "../../types/strategy-types";
import { IData } from "../../types/general-types";
import { IFilterData, IStockData } from "../../types/data-processing-types";

// Mock BackTestHelper

const mockFilterGroupInstance = {
  filters: [
    { varName: "test", operator: "<", compareVal: "3" },
    { varName: "percentchange", operator: ">", compareVal: "1" },
  ],
  connectors: new Array<string>(),
  getFilters: jest.fn().mockReturnValue([
    { varName: "test", operator: "<", compareVal: "3" },
    { varName: "percentchange", operator: ">", compareVal: "1" },
  ]),
  run: jest.fn(),
  getVariables: jest.fn().mockReturnValue([{ name: "variable1" }, { name: "variable2" }]),
};

const mockBackTestHelper = {
  collectData: jest.fn().mockReturnValue(["mocked collectData"]),
};
jest.mock("../../shared/classes/filter-group");

jest.mock("../../back-testing/back-test-helper", () => ({
  BackTestHelper: jest.fn().mockImplementation(() => mockBackTestHelper),
}));

jest.mock("../../shared/classes/filter-group", () => ({
  FilterGroup: jest.fn().mockImplementation(() => mockFilterGroupInstance),
}));

describe("AnalysisBackTest", () => {
  let analysisBackTest: AnalysisBackTest;
  let period: PeriodType;
  let scenarioFilterGroup: IFilterGroup;
  let mockDataFilters: IFilter[];

  beforeEach(() => {
    period = PeriodType.DAY;
    scenarioFilterGroup = {
      filters: [
        { varName: "percentchange", operator: ">", compareVal: "1" },
        { varName: "percentchange", operator: "<", compareVal: "3" },
      ],
      connectors: [],
    };
    mockDataFilters = [];

    analysisBackTest = new AnalysisBackTest(
      period,
      scenarioFilterGroup,
      mockDataFilters,
    );
  });

  describe("getTestResults", () => {
    it("should return dataVars from Analysis", () => {
      const mockDataVars: IData[] = [
        {
          key: "value",
          symbol: "",
          time: 0,
        },
      ];
      analysisBackTest.dataVars = mockDataVars;

      const result = analysisBackTest.getTestResults();

      expect(result).toEqual(mockDataVars);
    });
  });

  describe("run", () => {
    it("should run the analysis and update dataVars", () => {
      const mockTime = 123456789;
      const mockResults: IStockData[] = [
        {
          symbol: "AAPL",
          price: 150,
          datetime: 0,
          volume: 0,
        },
      ];
      const mockFilterData: IFilterData = { AAPL: { key: 150 } };

      analysisBackTest.setVars(mockFilterData);
      mockFilterGroupInstance.run.mockReturnValue(true);

      analysisBackTest.run(mockTime, mockResults);

      expect(analysisBackTest.getTestResults()).toEqual(["mocked collectData"]);
      expect(mockBackTestHelper.collectData).toHaveBeenCalledWith(
        [{ variableValues: {}, time: mockTime, symbol: "AAPL", price: 150 }],
        period,
        mockDataFilters,
      );
    });
  });

  describe("setVars", () => {
    it("should set the vars property", () => {
      const mockVars: IFilterData = { AAPL: { key: 150 } };

      analysisBackTest.setVars(mockVars);

      expect(analysisBackTest.getVars()).toEqual(mockVars);
    });
  });

  describe("getVariables", () => {
    it("should return the scenario filters' variables", () => {
      const result = analysisBackTest.getVariables().map((v) => v.name);

      expect(result).toEqual(["variable1", "variable2"]);
    });
  });
});
