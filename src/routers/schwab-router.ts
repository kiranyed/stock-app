import express, { NextFunction, Request, Response } from "express";
import { AxiosError } from "axios";
import { StatusCodes } from "http-status-codes";
import Error400 from "../errors/error-400";
import {
  SchwabAuth,
  SchwabSignInRequiredError,
} from "../providers/schwab/schwab-auth";

/** Mounted at /api/schwab, behind authMiddleware. */
const router = express.Router();

router.get("/status", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await SchwabAuth.status());
  } catch (err) {
    next(err);
  }
});

router.get("/authorize-url", (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ url: SchwabAuth.authorizeUrl() });
  } catch (err) {
    next(err);
  }
});

/** Body: { url } — the address Schwab redirected the browser to after login. */
router.post("/sign-in", async (req: Request, res: Response, next: NextFunction) => {
  const input = req.body?.url;
  if (typeof input !== "string" || !input.trim()) {
    return next(new Error400("Body must be { url: <the redirected URL> }"));
  }
  try {
    res.json(await SchwabAuth.completeSignIn(input));
  } catch (err) {
    const status = (err as AxiosError)?.response?.status;
    if (status === 400 || status === 401) {
      return next(new Error400("Schwab rejected the code. Codes expire after about 30 seconds; sign in again."));
    }
    next(err);
  }
});

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * GET /schwab-token for other tools on this machine (elliott-wave-trader).
 * Same shape as the old token server's /get-token, plus `accessToken`.
 * Only answers connections from loopback; there's no user login on it.
 */
export const localTokenHandler = async (req: Request, res: Response) => {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) {
    res.status(StatusCodes.FORBIDDEN).json({ error: "Only available from this machine" });
    return;
  }
  try {
    const token = await SchwabAuth.getAccessToken();
    const { accessExpiresAt } = await SchwabAuth.status();
    res.json({ token, accessToken: token, refreshTime: accessExpiresAt });
  } catch (err) {
    if (err instanceof SchwabSignInRequiredError) {
      res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ error: err.message });
      return;
    }
    res.status(StatusCodes.BAD_GATEWAY).json({ error: (err as Error)?.message ?? "Token refresh failed" });
  }
};

export default router;
