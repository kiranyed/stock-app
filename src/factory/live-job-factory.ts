import { ScreenerJobType } from "../shared/constants";
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
    simulationOptions?: IStrategySimulationOptions,
  ): ILiveStockScreenerJob {
    if (type !== ScreenerJobType.STRATEGY) {
      throw new Error("Invalid job type in createLiveJobInstance");
    }
    return simulationOptions ? new StrategySimulation(strategy, simulationOptions) : new StrategySimulation(strategy);
  }
}
