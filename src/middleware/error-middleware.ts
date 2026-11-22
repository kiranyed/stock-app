import { Request, Response, NextFunction } from "express";
import BaseError from "../errors/base-error";
import Error500 from "../errors/error-500";

//TODO why is this async?
export async function errorCatcher(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof BaseError) {
    next(err);
  } else {
    next(new Error500(err.message));
  }
}

export async function errorMiddleware(
  err: BaseError,
  req: Partial<Request>,
  res: Response,
  next: NextFunction,
) {
  if (!err) {
    next();
  } else {
    console.error(err.stack);
    res.status(err.statusCode).json({ ...err, message: err.message });
  }
}
