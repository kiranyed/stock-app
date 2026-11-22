import { StatusCodes } from "http-status-codes";
import { NextFunction, Request, Response } from "express";
import express from "express";
import * as bcrypt from "bcrypt";
import cors from "cors";
import * as jwt from "jsonwebtoken";
import Error404 from "../errors/error-404";
import Error400 from "../errors/error-400";
import Error401 from "../errors/error-401";
import UserRepository from "../shared/services/repos/user-repository";
import { errorCatcher, errorMiddleware } from "../middleware/error-middleware";
import { getJwtSecret } from "../middleware/auth-middleware";

const router = express.Router();
const saltRounds = 10;

const testEndpoint = (req: Request, res: Response, next: NextFunction) => {
  try {
    throw new Error400("test error");
  } catch (error) {
    next(error);
  }
};

const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    if (!body.username) {
      throw new Error400("must enter username");
    }
    if (typeof body.username !== "string") {
      throw new Error400("username must be a string");
    }
    // https://stackoverflow.com/questions/336210/regular-expression-for-alphanumeric-and-underscores
    if (!body.username.match(/^\w+$/)) {
      throw new Error400(
        "username must consist only of alphanumeric characters",
      );
    }
    if (!body.password) {
      throw new Error400("must enter password");
    }
    if (typeof body.password !== "string") {
      throw new Error400("password must be a string");
    }
    // https://stackoverflow.com/questions/19605150/regex-for-password-must-contain-at-least-eight-characters-at-least-one-number-a
    if (!body.password.match(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/)) {
      throw new Error400(
        "password must be Minimum eight characters, at least one letter and one number",
      );
    }
    const hash = await bcrypt.hash(body.password, saltRounds);
    const row = await UserRepository.createUser(body.username, hash);
    res.status(StatusCodes.OK).json({
      message: "Successfully created user " + body.username,
      id: row.insertId,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body;
  const username = body.username;
  const password = body.password;
  try {
    if (!body.username) {
      throw new Error400("Must enter a username");
    }
    if (typeof body.username !== "string") {
      throw new Error400("Username must be a string");
    }
    if (!body.password) {
      throw new Error400("Must enter a password");
    }
    if (typeof body.password !== "string") {
      throw new Error400("Password must be a string");
    }
    const data = await UserRepository.getPassAndIdForUser(username);
    const hash = data[0] && data[0].password;
    const id = data[0] && data[0].id;
    if (!hash) {
      throw new Error404("No user named " + username + " found");
    }
    const match = await bcrypt.compare(password, hash);
    if (!match) {
      throw new Error401("Invalid password");
    }

    const EXPIRES_IN = "24h";
    const token = jwt.sign({ sub: id, role: "user" }, getJwtSecret(), {
      expiresIn: EXPIRES_IN,
    });
    res.status(StatusCodes.OK).json({ token, user: username });
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
