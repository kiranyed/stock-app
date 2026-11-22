import { AnalysisLive } from "../../analysis/analysis-live";
import { PeriodType } from "../../shared/constants";
import { IFilterGroup, IFilter } from "../../types/strategy-types";

jest.mock("../../analysis/analysis");

describe("AnalysisLive", () => {
  let analysisLive: AnalysisLive;
  let mockPeriod: PeriodType;
  let mockScenarioFilterGroup: IFilterGroup;
  let mockDataFilters: IFilter[];

  beforeEach(() => {
    mockPeriod = PeriodType.DAY;
    mockScenarioFilterGroup = { filters: [], connectors: [] };
    mockDataFilters = [];

    analysisLive = new AnalysisLive(
      mockPeriod,
      mockScenarioFilterGroup,
      mockDataFilters,
    );
  });

  describe("getId", () => {
    it("should return the id", () => {
      const mockId = 123;
      analysisLive.setId(mockId);

      const result = analysisLive.getId();

      expect(result).toBe(mockId);
    });
  });

  describe("setId", () => {
    it("should set the id", () => {
      const mockId = 123;
      analysisLive.setId(mockId);

      expect(analysisLive.getId()).toBe(mockId);
    });
  });
});
