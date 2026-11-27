import { Request, Response, NextFunction } from "express";
import BaseError from "../errors/base-error";
import Error500 from "../errors/error-500";

export const INTERNAL_ERROR_MESSAGE = "Internal server error";

/** An error from Express's own middleware (body-parser etc.) whose message is meant for the client. */
interface IExposableError extends Error {
  status?: number;
  expose?: boolean;
}

/**
 * Turns anything thrown into a BaseError. Our own errors pass through, since we wrote their
 * messages. Anything else (MySQL, axios, a bug) is logged here in full and replaced with a
 * generic 500, so the client never sees database messages, SQL, file paths or stack traces.
 */
export function errorCatcher(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof BaseError) return next(err);

  const { status, expose } = err as IExposableError;
  if (expose === true && typeof status === "number" && status >= 400 && status < 500) {
    return next(new BaseError(err.message, status, true));
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  next(new Error500(INTERNAL_ERROR_MESSAGE));
}

/** Sends a BaseError as `{ statusCode, message }`; nothing else from the error object. */
export function errorMiddleware(err: BaseError, req: Partial<Request>, res: Response, next: NextFunction) {
  if (!err) return next();
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500 && err.message !== INTERNAL_ERROR_MESSAGE) console.error(err.stack);
  res.status(statusCode).json({ statusCode, message: err.message });
}
