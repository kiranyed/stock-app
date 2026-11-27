import { Request, NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import Error401 from "../errors/error-401";
import dotenv from "dotenv";

dotenv.config();

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

/**
 * Verifies the `x-access-token` JWT and sets the `user-id` header from its `sub` claim.
 * Any problem with the token (missing, malformed, tampered, expired) is a 401, which is what
 * makes the frontend drop the token and send the user to the login page.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-access-token"];
  if (!token || Array.isArray(token)) return next(new Error401("Token is missing"));

  let claims: string | jwt.JwtPayload;
  try {
    claims = jwt.verify(token, getJwtSecret());
  } catch (err) {
    // TokenExpiredError and NotBeforeError are subclasses of JsonWebTokenError
    if (err instanceof jwt.TokenExpiredError) return next(new Error401("Token expired"));
    if (err instanceof jwt.JsonWebTokenError) return next(new Error401("Invalid token"));
    return next(err); // e.g. JWT_SECRET not set: a server problem, not the client's
  }

  if (typeof claims === "string" || typeof claims.sub !== "number") return next(new Error401("Invalid token"));
  req.headers["user-id"] = claims.sub as unknown as string;
  next();
}
