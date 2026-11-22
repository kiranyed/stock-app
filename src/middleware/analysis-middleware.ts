import { NextFunction, Request, Response } from "express";
import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import { IFilter } from "../types/strategy-types";
import { checkFilters, isLike, validateFilter } from "./shared-funcs";
import StockGroupRepository from "../shared/services/repos/stock-group-repository";
import { Like } from "../types/general-types";

type IAnalysisRequest = {
  scenarioFilters: IFilter[];
  dataFilters: IFilter[];
  startTime: string;
  endTime: string;
  period: string;
  groupId: number;
};

type IVariableCheckRequest = {
  variables: Array<Partial<IFilter> & { varName: string }>;
  groupId: number;
  startTime?: number;
  endTime?: number;
};

/* create a type that uses generics, and sets every key type to object, except if the key type
is a primitive */

//type Like<T, Keys extends keyof T = keyof T> = { [K in Keys]: T[K]  };

function isAnalysisRequest(
  request: unknown,
): request is Like<IAnalysisRequest> {
  return (
    isLike<IAnalysisRequest>(request) &&
    typeof request.scenarioFilters === "object" &&
    typeof request.dataFilters === "object" &&
    typeof request.startTime === "number" &&
    typeof request.endTime === "number" &&
    typeof request.groupId === "number" &&
    typeof request.period === "number"
  );
}

function isVariableCheckRequest(
  request: unknown,
): request is Like<IVariableCheckRequest> {
  return (
    isLike<IVariableCheckRequest>(request) &&
    typeof request.groupId === "number" &&
    typeof request.variables === "object" &&
    (request.startTime === undefined || typeof request.startTime === "number") &&
    (request.endTime === undefined || typeof request.endTime === "number")
  );
}

async function validateGroup(groupId: number) {
  const a = await StockGroupRepository.getSymbolsFromGroupById(groupId);
  if (!a[0]) {
    throw new Error404(groupId + " not found");
  }
}

function validateStartAndEndTime(startTime: string, endTime: string) {
  const start = parseFloat(startTime);
  const end = parseFloat(endTime);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error400("startTime and endTime must be valid integers");
  }
  if (start >= end) {
    throw new Error400("startTime must be less than endTime");
  }
}

export async function validateAnalysisRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const payload: unknown = req.body;
  try {
    if (isAnalysisRequest(payload)) {
      if (checkFilters(payload.scenarioFilters)) {
        payload.scenarioFilters.every((filter) => validateFilter(filter));
      }
      if (checkFilters(payload.dataFilters)) {
        payload.dataFilters.every((filter) => validateFilter(filter));
      }
      await validateGroup(payload.groupId);
      validateStartAndEndTime(payload.startTime, payload.endTime);
      next();
    } else {
      throw new Error400(
        "payload is invalid; must contain all the properties of type IAnalysisRequest",
      );
    }
  } catch (err) {
    next(err);
    // return res.status(err.statusCode).json({ msg: err.description})
  }
}

export async function validateVariableCheckRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const payload: unknown = req.body;
  try {
    if (!isVariableCheckRequest(payload)) {
      throw new Error400(
        "payload is invalid; must contain groupId and variables",
      );
    }

    if (!Array.isArray(payload.variables) || payload.variables.length === 0) {
      throw new Error400("variables must be a non-empty array");
    }

    payload.variables.forEach((variable, index) => {
      if (!variable || typeof variable.varName !== "string" || !variable.varName) {
        throw new Error400(
          `Variable at index ${index} must include a valid varName`,
        );
      }
    });

    if (
      payload.startTime !== undefined &&
      payload.endTime !== undefined
    ) {
      validateStartAndEndTime(
        payload.startTime + "",
        payload.endTime + "",
      );
    }

    await validateGroup(payload.groupId);
    next();
  } catch (err) {
    next(err);
  }
}
