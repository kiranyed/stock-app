//gets called by the router.  creates the jobs

import { StrategyType, ScreenerJobType, PeriodType } from "../constants";
import { AnalysisBackTestFactory } from "../../factory/analysis-back-test-factory";
import { BackTestFactory } from "../../factory/back-test-factory";
import { LiveJobFactory } from "../../factory/live-job-factory";
import StockGroupMapper from "../../mappers/stock-group-mapper";
import StrategyMapper from "../../mappers/strategy-mapper";
import { IStrategySimulationOptions } from "../../real-time-trading/strategy-simulation";
import { IBackTestScreenerJob } from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { IFilterGroup, IFilter, IStrategy } from "../../types/strategy-types";
import StockGroupRepository from "./repos/stock-group-repository";
import StrategyRepository from "./repos/strategy-repository";

//  the jobs are then used by  back test service or live job runner
export class ScreenerJobService {
  //return strategies
  static async setUpStrategies(strategyId: string | string[], groupId: string) {
    let strategies;
    if (Array.isArray(strategyId)) {
      strategies = await this.getStrategies(
        strategyId.map((id) => parseInt(id)),
      );
    } else {
      strategies = await this.getStrategy(parseInt(strategyId));
    }
    const group = await this.getGroup(parseInt(groupId));
    return { strategies, group };
    //return {runs, group};
  }

  static async setUpStrategyRunsLive(
    strategyId: string | string[],
    groupId: string,
    type: StrategyType,
    simulationOptions?: IStrategySimulationOptions,
  ) {
    const { strategies, group } = await this.setUpStrategies(
      strategyId,
      groupId,
    );
    const runs = this.createStrategyRuns(strategies, type, simulationOptions);
    return { runs, group };
  }

  static async setUpStrategyBackTest(
    strategyId: string | string[],
    groupId: string,
  ): Promise<{ runs: IBackTestScreenerJob[]; group: IStockGroup }> {
    const { strategies, group } = await this.setUpStrategies(
      strategyId,
      groupId,
    );
    const runs = strategies.map((strategy) =>
      BackTestFactory.createBackTestInstance(
        ScreenerJobType.STRATEGY,
        strategy,
      ),
    );
    return { runs, group };
  }

  //return analyses
  static async setUpAnalysisBackTest(
    period: PeriodType,
    scenarioFilterGroup: IFilterGroup,
    dataFilters: IFilter[],
    groupId: string,
  ) {
    const analyses = AnalysisBackTestFactory.createAnalysisBackTest(
      period,
      scenarioFilterGroup,
      dataFilters,
    );
    const group = await this.getGroup(parseInt(groupId));
    return { analyses, group };
  }

  // static async setUpAnalysisLive(config: IAnalysisConfig, scenarioFilterGroup: IFilterGroup, dataFilters: IFilter[], groupId: number) {
  //     const analysis = n
  // }

  static getStrategies(strategyIds: number[]) {
    return StrategyRepository.getStrategies(strategyIds).then((entities) =>
      entities.map((entity) => StrategyMapper.convertEntityToStrategy(entity)),
    );
  }

  static getStrategy(strategyId: number) {
    return StrategyRepository.getStrategies([strategyId]).then((entities) => {
      return entities.map((entity) =>
        StrategyMapper.convertEntityToStrategy(entity),
      );
    });
  }

  static getGroup(groupId: number) {
    return StockGroupRepository.getGroup(groupId).then(
      (entities) =>
        entities.map((entity) =>
          StockGroupMapper.convertEntityToGroup(entity),
        )[0],
    );
  }

  static createStrategyRuns(
    strategies: IStrategy[],
    type: StrategyType,
    simulationOptions?: IStrategySimulationOptions,
  ) {
    return strategies.map((strategy) =>
      LiveJobFactory.createLiveJobInstance(
        ScreenerJobType.STRATEGY,
        strategy,
        type,
        simulationOptions,
      ),
    );
  }
}
