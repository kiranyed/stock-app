import { Request } from "express";
import Error400 from "../errors/error-400";
import { Like } from "../types/general-types";
import { IFilter } from "../types/strategy-types";
import { AuthenticatedRequest } from "../types/middleware-types";
import { CONSTANTS } from "../shared/constants";

enum VAR_NAME {
  PRICE_SMA = "priceSma",
  VOLUME_SMA = "volumeSma",
  PRICE_EMA = "priceEma",
  PERCENT_CHANGE = "percentchange",
  PERCENT_GAIN = "percentGain",
  TIME_SINCE_PURCHASE = "timeSinceEntry",
  VOLUME_CHANGE = "volumeChange",
  MTSI = "mtsi",
  TSI = "tsi",
  MACD = "macd",
  MACD_CROSSOVER = "macdCrossover",
  RSI = "rsi",
  RSI_CROSSOVER = "rsiCrossover",
  MACD_DIVERGENCE = "macdDivergence",
  RSI_DIVERGENCE = "rsiDivergence",
  ADX = "adx",
  BOLLINGER_BANDS = "bollingerbands",
  EMA = "priceema",
  SMA = "pricesma",
  VWAP = "vwap",
  PRICE_PERCENT_CHANGE_PERCENTILE = "pricePercentChangePercentile",
}

const VAR_NAMES = [
  VAR_NAME.PRICE_SMA,
  VAR_NAME.VOLUME_SMA,
  VAR_NAME.PRICE_EMA,
  VAR_NAME.PERCENT_CHANGE,
  VAR_NAME.PERCENT_GAIN,
  VAR_NAME.TIME_SINCE_PURCHASE,
  VAR_NAME.VOLUME_CHANGE,
  VAR_NAME.MTSI,
  VAR_NAME.TSI,
  VAR_NAME.MACD,
  VAR_NAME.RSI,
  VAR_NAME.MACD_CROSSOVER,
  VAR_NAME.RSI_CROSSOVER,
  VAR_NAME.MACD_DIVERGENCE,
  VAR_NAME.RSI_DIVERGENCE,
  VAR_NAME.ADX,
  VAR_NAME.BOLLINGER_BANDS,
  VAR_NAME.EMA,
  VAR_NAME.SMA,
  VAR_NAME.VWAP,
  VAR_NAME.PRICE_PERCENT_CHANGE_PERCENTILE,
];

export const OPERATORS = [">", ">=", "<", "<=", "="];

const ALL_VAR_NAMES = Object.values(VAR_NAMES);
export const ALL_OPERATORS = Object.values(OPERATORS);
function checkVarName(varName: string) {
  if (VAR_NAMES.some((v) => v === varName)) {
    return "";
  } else {
    return (
      "varName must be one of the following values: " + ALL_VAR_NAMES.join(", ")
    );
  }
}

export function checkAndGetUserId(req: Request): number {
  userIdCheck(req);
  return getUserIdFromRequest(req);
}

export function getUserIdFromRequest(req: AuthenticatedRequest) {
  return parseInt(req.headers["user-id"]);
}

export function userIdCheck(req: Request): asserts req is AuthenticatedRequest {
  if (!req.headers["user-id"] || Array.isArray(req.headers["user-id"])) {
    throw new Error400("userId is missing");
  }
}

/** The caller's user id, which authMiddleware sets from the verified token. */
export function requireUserId(req: Request): number {
  userIdCheck(req);
  return getUserIdFromRequest(req);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isInteger(value: string): boolean {
  if (value.trim() === "" || value === null || value === undefined)
    return false;
  const num = Number(value);
  return !isNaN(num) && Number.isInteger(num);
}

function checkOperator(operator: string) {
  if (OPERATORS.includes(operator)) {
    return "";
  } else {
    return (
      "operator must be one of the following values: " +
      ALL_OPERATORS.join(", ")
    );
  }
}

function checkCompareVal(compareVal: unknown) {
  const newVal = compareVal + "";
  if (newVal.match(/^-?\d+(,\d+)*(\.\d+(e\d+)?)?$|[a-zA-z]/)) {
    return "";
  } else {
    return "compareVal must be either a number or a string consisting of only letters";
  }
}

export function isLike<T>(
  given: unknown,
): given is Partial<Record<keyof T, unknown>> {
  return typeof given === "object" && given !== null;
}

export function isArray(filters: unknown): filters is unknown[] {
  return Array.isArray(filters);
}

export function isFilter(override: unknown): override is IFilter {
  return (
    isLike<IFilter>(override) &&
    typeof override.varName === "string" &&
    typeof override.operator === "string" &&
    typeof override.compareVal === "string"
  );
}

export function validatePercentileSessionLimit(
  period: number,
  numberOfSessions: number,
): void {
  const max =
    CONSTANTS.MAX_PERCENTILE_SESSIONS[
      period as keyof typeof CONSTANTS.MAX_PERCENTILE_SESSIONS
    ];
  if (max !== undefined && numberOfSessions > max) {
    throw new Error400(
      `numberOfSessions (${numberOfSessions}) exceeds the maximum allowed (${max}) for a ${period}-minute candle period`,
    );
  }
}

export function validateFilter(filter: IFilter, strategyPeriod?: number) {
  let msg = checkVarName(filter.varName);
  if (msg) {
    throw new Error400(msg);
  }
  const varName = filter.varName;
  if (
    varName === VAR_NAME.PRICE_PERCENT_CHANGE_PERCENTILE &&
    strategyPeriod !== undefined
  ) {
    const nsRaw = (filter as unknown as Record<string, unknown>).numberOfSessions;
    if (nsRaw !== undefined) {
      const ns = parseInt(String(nsRaw), 10);
      if (Number.isInteger(ns)) {
        validatePercentileSessionLimit(strategyPeriod, ns);
      }
    }
  }
  if (varName === VAR_NAME.PERCENT_CHANGE) {
    const filterCasted = filter;
    if (filterCasted.timeAgo) {
      const parsed = parseInt(filterCasted.timeAgo);
      if (!Number.isInteger(parsed)) {
        throw new Error400("timeAgo must be an integer");
      }
    } else {
      throw new Error400("timeAgo is required for percentchange filter");
    }
  }
  msg = checkOperator(filter.operator);
  if (msg) {
    throw new Error400(msg);
  }
  msg = checkCompareVal(filter.compareVal);
  if (msg) {
    throw new Error400(msg);
  }
}

export function checkFilters(filters: unknown): filters is Like<IFilter>[] {
  let msg = "";
  if (isArray(filters)) {
    filters.every((filter, idx) => {
      if (!isFilter(filter)) {
        msg = "Entry at position " + idx + " is not of type IFilter";
        return false; // Stop iteration
      }
      return true; // Continue to next item
    });
  } else {
    msg = "filters must be an array";
  }

  if (msg) {
    throw new Error400(msg);
  }
  return true;
}

export function validateDateRange(startTime: string, endTime: string) {
  const start = Number(startTime);
  const end = Number(endTime);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error400("startTime and endTime must be valid integers");
  }
  if (start >= end) {
    throw new Error400("startTime must be less than endTime");
  }
}
