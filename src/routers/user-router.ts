import { StatusCodes } from "http-status-codes";
import { NextFunction, Request, Response } from "express";
import express from "express";
import cors from "cors";
import Error400 from "../errors/error-400";
import { errorCatcher, errorMiddleware } from "../middleware/error-middleware";
import { UserService } from "../services/user-service";

const router = express.Router();

const testEndpoint = (req: Request, res: Response, next: NextFunction) => {
  try {
    throw new Error400("test error");
  } catch (error) {
    next(error);
  }
};

const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, username } = await UserService.register(req.body?.username, req.body?.password);
    res.status(StatusCodes.OK).json({ message: "Successfully created user " + username, id });
  } catch (error) {
    next(error);
  }
};

const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await UserService.login(req.body?.username, req.body?.password));
  } catch (error) {
    return next(error);
  }
};

// Apply middleware
router.use(cors());

// Register routes
router.get("/asdf", testEndpoint);
router.post("/register", createUser);
router.post("/login", login);

router.use(errorCatcher);
router.use(errorMiddleware);
export { createUser, login };
export default router;
