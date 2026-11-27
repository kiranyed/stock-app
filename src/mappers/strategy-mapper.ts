import { IStrategyEntity } from "../types/entity-types";
import { IScreener, IStrategy } from "../types/strategy-types";
import { upgradeScreeners } from "../services/strategy-schema";

const StrategyMapper = {
  parseScreeners(screenerStr: string | IScreener[] | IScreener): IScreener[] {
    if (Array.isArray(screenerStr)) {
      return screenerStr;
    }
    if (typeof screenerStr === "string") {
      return JSON.parse(screenerStr);
    }
    if (screenerStr && typeof screenerStr === "object") {
      return [screenerStr as IScreener];
    }
    return [];
  },

  stringifyScreeners(screeners: IScreener[]): string {
    return JSON.stringify(screeners);
  },
  convertEntityToStrategy(entity: IStrategyEntity): IStrategy {
    return {
      id: entity.id,
      name: entity.name,
      // in the current format whatever version was stored (every screener gets its id)
      screeners: upgradeScreeners(this.parseScreeners(entity.screeners)),
      description: entity.description,
      period: entity.period,
    };
  },
  convertStrategyToEntity(
    strategy: IStrategy,
    userId: number,
  ): IStrategyEntity {
    return {
      id: strategy.id,
      name: strategy.name,
      screeners: this.stringifyScreeners(strategy.screeners),
      description: strategy.description,
      period: strategy.period,
      user_id: userId,
    };
  },
};

export default StrategyMapper;
