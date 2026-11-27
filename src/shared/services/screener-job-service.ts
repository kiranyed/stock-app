// Builds the jobs that BackTestService and LiveJobRunner run.

import Error404 from "../../errors/error-404";
import { ScreenerJobType } from "../constants";
import { BackTestFactory } from "../../factory/back-test-factory";
import { LiveJobFactory } from "../../factory/live-job-factory";
import StockGroupMapper from "../../mappers/stock-group-mapper";
import StrategyMapper from "../../mappers/strategy-mapper";
import { IStrategySimulationOptions } from "../../real-time-trading/strategy-simulation";
import { IBackTestScreenerJob } from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { IStrategy } from "../../types/strategy-types";
import StockGroupRepository from "./repos/stock-group-repository";
import StrategyRepository from "./repos/strategy-repository";

export class ScreenerJobService {
  /** The user's strategies and group, or Error404 if any of them is missing or someone else's. */
  static async setUpStrategies(
    userId: number,
    strategyIds: number[],
    groupId: number,
  ): Promise<{ strategies: IStrategy[]; group: IStockGroup }> {
    const unique = [...new Set(strategyIds)];
    const [entities, [groupEntity]] = await Promise.all([
      StrategyRepository.getOwnedStrategies(unique, userId),
      StockGroupRepository.getOwnedGroup(groupId, userId),
    ]);
    if (!unique.length || entities.length !== unique.length) throw new Error404("strategy not found");
    if (!groupEntity) throw new Error404("stock group not found");
    // keep the caller's order
    const byId = new Map(entities.map((e) => [e.id, StrategyMapper.convertEntityToStrategy(e)]));
    return {
      strategies: unique.map((id) => byId.get(id)!),
      group: StockGroupMapper.convertEntityToGroup(groupEntity),
    };
  }

  static async setUpStrategyRunsLive(
    userId: number,
    strategyIds: number[],
    groupId: number,
    simulationOptions?: IStrategySimulationOptions,
  ) {
    const { strategies, group } = await this.setUpStrategies(userId, strategyIds, groupId);
    const runs = this.createStrategyRuns(strategies, simulationOptions);
    return { runs, group };
  }

  static async setUpStrategyBackTest(
    userId: number,
    strategyIds: number[],
    groupId: number,
  ): Promise<{ runs: IBackTestScreenerJob[]; strategies: IStrategy[]; group: IStockGroup }> {
    const { strategies, group } = await this.setUpStrategies(userId, strategyIds, groupId);
    // the back test itself runs in a worker from `strategies`; these give the result rows their names
    const runs = strategies.map((strategy) =>
      BackTestFactory.createBackTestInstance(ScreenerJobType.STRATEGY, strategy),
    );
    return { runs, strategies, group };
  }

  /** The user's group, or Error404 if it's missing or someone else's. */
  static async getOwnedGroup(userId: number, groupId: number): Promise<IStockGroup> {
    const [groupEntity] = await StockGroupRepository.getOwnedGroup(groupId, userId);
    if (!groupEntity) throw new Error404("stock group not found");
    return StockGroupMapper.convertEntityToGroup(groupEntity);
  }

  static createStrategyRuns(
    strategies: IStrategy[],
    simulationOptions?: IStrategySimulationOptions,
  ) {
    return strategies.map((strategy) =>
      LiveJobFactory.createLiveJobInstance(ScreenerJobType.STRATEGY, strategy, simulationOptions),
    );
  }
}
