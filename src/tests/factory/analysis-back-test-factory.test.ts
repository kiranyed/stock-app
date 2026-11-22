import { PeriodType } from "../../shared/constants";
import { AnalysisBackTest } from "../../analysis/analysis-back-test";
import { AnalysisBackTestFactory } from "../../factory/analysis-back-test-factory";
import { IFilterGroup, IFilter } from "../../types/strategy-types";

jest.mock("../../analysis/analysis-back-test");

describe("AnalysisBackTestFactory", () => {
  describe("createAnalysisBackTest", () => {
    it("should create an instance of AnalysisBackTest with the correct parameters", () => {
      const period: PeriodType = PeriodType.DAY;
      const scenarioFilterGroup: IFilterGroup = { filters: [], connectors: [] };
      const dataFilters: IFilter[] = [];

      const analysisBackTest = AnalysisBackTestFactory.createAnalysisBackTest(
        period,
        scenarioFilterGroup,
        dataFilters,
      );

      expect(AnalysisBackTest).toHaveBeenCalledWith(
        period,
        scenarioFilterGroup,
        dataFilters,
      );
      expect(analysisBackTest).toBeInstanceOf(AnalysisBackTest);
    });
  });
});
