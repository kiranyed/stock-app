import { BackTestHelper } from "../back-testing/back-test-helper";
import {
  IBackTestScreenerJob,
  IFilterData,
} from "../types/data-processing-types";
import { Analysis } from "./analysis";

export class AnalysisBackTest extends Analysis implements IBackTestScreenerJob {
  getTestResults() {
    return this.dataVars;
  }

  getCrossPeriodVars(): IFilterData {
    return {};
  }

  setBackTestHelper(backTestHelper: BackTestHelper) {
    this.backTestHelper = backTestHelper;
  }
}
