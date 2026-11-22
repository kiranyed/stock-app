import { Request, NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import Error401 from "../errors/error-401";
import Error400 from "../errors/error-400";
import dotenv from "dotenv";

dotenv.config();

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers["x-access-token"];
  try {
    if (!token || Array.isArray(token)) {
      throw new Error400("Token is missing");
    }
    const claims = jwt.verify(token, getJwtSecret());
    if (typeof claims.sub === "number") {
      req.headers["user-id"] = claims.sub;
      //req.context = { userId: parseInt(claims.sub) };
      next();
    } else {
      throw new Error401();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "TokenExpiredError") {
      return next(new Error401("Token expired"));
    } else {
      return next(err);
    }
  }
}
