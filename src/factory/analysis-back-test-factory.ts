import { PeriodType } from "../shared/constants";
import { AnalysisBackTest } from "../analysis/analysis-back-test";
import { IFilterGroup, IFilter } from "../types/strategy-types";

export class AnalysisBackTestFactory {
  static createAnalysisBackTest(
    period: PeriodType,
    scenarioFilterGroup: IFilterGroup,
    dataFilters: IFilter[],
  ) {
    return new AnalysisBackTest(period, scenarioFilterGroup, dataFilters);
  }
}
