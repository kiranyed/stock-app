import { NextFunction, Request, Response, Router } from "express";
import { StatusCodes } from "http-status-codes";
import { SettingsService } from "../services/settings-service";

/** Mounted at /api/settings, behind authMiddleware. Read only. */
const router = Router();

/** GET /api/settings → the install's data provider, alert channels and back-test settings */
const getSettings = (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(SettingsService.get());
  } catch (error) {
    next(error);
  }
};

router.get("/", getSettings);

export { getSettings };
export default router;
