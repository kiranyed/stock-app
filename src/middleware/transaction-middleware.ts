import { Request, NextFunction, Response } from "express";
import Error400 from "../errors/error-400";

export function validateTransactionRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { pingTime, runId } = req.query;
  if (pingTime === undefined) {
    throw new Error400("pingTime is undefined");
  }
  if (Array.isArray(pingTime)) {
    throw new Error400(`pingTime can't be an array`);
  }

  if (
    !(typeof pingTime === "string") ||
    !Number.isInteger(parseFloat(pingTime)) ||
    parseFloat(pingTime) < 0
  ) {
    throw new Error400(
      "pingTime must be an integer that is greater than or equal to 0",
    );
  }
  if (!runId) {
    throw new Error400("must pass a  runId or array of run ids");
  }
  next();
}
