import { Request, NextFunction, Response } from "express";
import { strategiesExist, strategyExists } from "./strategy-middleware";
import Error400 from "../errors/error-400";
import { checkIfGroupExists } from "./group-middleware";
import { isInteger, isString } from "./shared-funcs";

export function validateDateRange(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { startTime, endTime } = req.query;

  try {
    if (!isString(startTime) || !isInteger(startTime)) {
      throw new Error400("startTime must be a number");
    }
    if (!isString(endTime) || !isInteger(endTime)) {
      throw new Error400("endTime must be a number");
    }

    if (parseInt(startTime) < parseInt(endTime)) {
      next();
    } else {
      throw new Error400("startTime must be before endTime");
    }
  } catch (error) {
    return next(error);
  }
}

export async function validate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { strategyId, groupId } = req.query;

  try {
    if (!strategyId) {
      throw new Error("must pass in a strategy id");
    }

    /*  make sure groupId is not a array of strings, meaning there's not more than
            one group id passed in the query*/
    if (!groupId || Array.isArray(groupId)) {
      throw new Error("must pass in one group id");
    }

    if (!isString(groupId)) {
      throw new Error("groupId must be a string");
    }

    let count;
    if (Array.isArray(strategyId) && strategyId.every((s) => isString(s))) {
      count = await strategiesExist(strategyId);
    } else if (isString(strategyId)) {
      count = await strategyExists(strategyId);
    } else {
      throw new Error400("strategyId property is invalid");
    }
    if (!count) {
      throw new Error400("at least one strategy in the list does not exist");
    }
    const groupExists = await checkIfGroupExists(parseInt(groupId));
    if (!groupExists) {
      throw new Error("Stock group does not exist");
    }
    next();
  } catch (error) {
    return next(error);
  }
}
