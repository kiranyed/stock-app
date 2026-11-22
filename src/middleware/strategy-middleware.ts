import { Request, NextFunction, Response } from "express";
import Error400 from "../errors/error-400";
import {
  IFilterGroup,
  IFilterGroupPair,
  IScreener,
  IStrategy,
} from "../types/strategy-types";
import StrategyRepository from "../shared/services/repos/strategy-repository";
import { isArray, isLike, validateFilter, checkFilters } from "./shared-funcs";
import { Like } from "../types/general-types";

enum Connectors {
  AND = "AND",
  OR = "OR",
}

function isScreener(screener: unknown): screener is Like<IScreener> {
  return (
    isLike<IScreener>(screener) &&
    (typeof screener.buySellFilters === "object" ||
      typeof screener.shortCoverFilters === "object")
  );
}

function isFilterGroupPair(pair: unknown): pair is Like<IFilterGroupPair> {
  return (
    isLike<IFilterGroupPair>(pair) &&
    typeof pair.enter === "object" &&
    typeof pair.exit === "object"
  );
}

function isFilterGroup(group: object): group is Like<IFilterGroup> {
  return (
    isLike<IFilterGroup>(group) &&
    typeof group.filters === "object" &&
    typeof group.connectors === "object"
  );
}

function isStrategy(strategy: unknown): strategy is Like<IStrategy> {
  return (
    isLike<IStrategy>(strategy) &&
    typeof strategy.name === "string" &&
    typeof strategy.period === "number" &&
    typeof strategy.screeners === "object" &&
    typeof strategy.description === "string"
  );
}

function validateConnectors(connectors: object) {
  if (isArray(connectors)) {
    if (
      !connectors.every(
        (connector) =>
          connector === Connectors.AND || connector === Connectors.OR,
      )
    ) {
      throw new Error400("every connector must be AND or OR");
    }
  } else {
    throw new Error400("connectors must be an array of strings");
  }
}

function validateFilterGroup(group: Like<IFilterGroup>, strategyPeriod?: number) {
  if (isFilterGroup(group)) {
    const filters = group.filters;
    const check = checkFilters(filters);
    if (check) {
      filters.every((filter) => validateFilter(filter, strategyPeriod));
    }
    validateConnectors(group.connectors);
  } else {
    throw new Error400("invalid filter group");
  }
}

function validateFilterGroupPair(pair: object, strategyPeriod?: number) {
  if (isFilterGroupPair(pair)) {
    const { enter, exit } = pair;
    if (isFilterGroup(enter)) {
      validateFilterGroup(enter, strategyPeriod);
    }
    if (isFilterGroup(exit)) {
      validateFilterGroup(exit, strategyPeriod);
    }
  }
}

export function validateStrategy(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const payload = req.body;

  if (
    req?.method === "GET" ||
    req?.method === "OPTIONS" ||
    req?.method === "DELETE"
  ) {
    next();
    return;
  }

  if (isStrategy(payload)) {
    const screeners = payload.screeners;
    const period = typeof payload.period === "number" ? payload.period : undefined;
    if (Array.isArray(screeners)) {
      const arr = screeners;
      arr.forEach((screener: unknown) => {
        if (isScreener(screener)) {
          if (screener.buySellFilters) {
            validateFilterGroupPair(screener.buySellFilters, period);
          }
          if (screener.shortCoverFilters) {
            validateFilterGroupPair(screener.shortCoverFilters, period);
          }
        }
      });
    }

    next();
  } else {
    throw new Error400("invalid strategy");
  }
}

export async function strategiesExist(strategyId: string[]) {
  const count = await StrategyRepository.checkStrategiesExist(strategyId);
  return count;
}

export async function strategyExists(id: string) {
  const count = await StrategyRepository.checkStrategiesExist([id]);
  return count;
}
