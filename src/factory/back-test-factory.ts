import { ScreenerJobType } from "../shared/constants";
import { BackTest } from "../back-testing/back-test";
import { IStrategy } from "../types/strategy-types";

export class BackTestFactory {
  static createBackTestInstance(type: ScreenerJobType, strategy: IStrategy) {
    // right now i'm passing in an IStrategy, later on it can be an IConfig
    // to include Analysis
    // if (type === ScreenerJobType.ANALYSIS) {
    //     return new AnalysisBackTest();
    // } else
    if (type === ScreenerJobType.STRATEGY) {
      return new BackTest(strategy);
    } else {
      throw new Error("Invalid job type in createBackTestInstance");
    }
  }
}
