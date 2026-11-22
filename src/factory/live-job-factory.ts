import { ScreenerJobType, StrategyType } from "../shared/constants";
import { RealMoneyStrategy } from "../real-time-trading/real-money-strategy";
import {
  IStrategySimulationOptions,
  StrategySimulation,
} from "../real-time-trading/strategy-simulation";
import { ILiveStockScreenerJob } from "../types/data-processing-types";
import { IStrategy } from "../types/strategy-types";

export class LiveJobFactory {
  static createLiveJobInstance(
    type: ScreenerJobType,
    strategy: IStrategy,
    strategyType?: StrategyType,
    simulationOptions?: IStrategySimulationOptions,
  ): ILiveStockScreenerJob {
    //TODO implement analysis live
    // if (type === ScreenerJobType.ANALYSIS) {
    //     return new AnalysisLive();
    // } else
    if (type === ScreenerJobType.STRATEGY) {
      if (strategyType === StrategyType.REAL) {
        return new RealMoneyStrategy(strategy);
      } else if (simulationOptions) {
        return new StrategySimulation(strategy, simulationOptions);
      } else {
        return new StrategySimulation(strategy);
      }
    } else {
      throw new Error("Invalid job type in createLiveJobInstance");
    }
  }
}
