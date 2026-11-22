import { Request, Router, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { validateStrategy } from "../middleware/strategy-middleware";
import StrategyRepository from "../shared/services/repos/strategy-repository";
import { IStrategy } from "../types/strategy-types";
import { AuthenticatedRequest } from "../types/middleware-types";
import Error400 from "../errors/error-400";
import StrategyMapper from "../mappers/strategy-mapper";
import { getUserIdFromRequest, userIdCheck } from "../middleware/shared-funcs";

export interface StrategyRequest extends AuthenticatedRequest {
  body: IStrategy;
}
export interface IDRequest extends AuthenticatedRequest {
  query: { id: string };
}
export interface IDsRequest extends AuthenticatedRequest {
  query: { id: string[] };
}

const strategyRouter = Router();

// Apply middlewares
strategyRouter.use(validateStrategy);

// Router functions
const getByName = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.query;
    if (
      typeof name === "string" ||
      (Array.isArray(name) && name.every((item) => typeof item === "string"))
    ) {
      const strategies = await StrategyRepository.getByName(
        Array.isArray(name) ? name : [name],
        2,
      );
      res.status(StatusCodes.OK).json({
        strategies: strategies.map((strategy) =>
          StrategyMapper.convertEntityToStrategy(strategy),
        ),
      });
    } else {
      throw new Error400("invalid name parameter");
    }
  } catch (error) {
    return next(error);
  }
};

const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    userIdCheck(req);
    const strategies = await StrategyRepository.getAllStrategies(
      getUserIdFromRequest(req),
    );
    res.status(StatusCodes.OK).json({
      strategies: strategies.map((strategy) =>
        StrategyMapper.convertEntityToStrategy(strategy),
      ),
    });
  } catch (error) {
    return next(error);
  }
};

const getAllNames = async (req: Request, res: Response, next: NextFunction) => {
  try {
    userIdCheck(req);
    const rows = await StrategyRepository.getAllNames(
      getUserIdFromRequest(req),
    );
    res.status(StatusCodes.OK).json(rows);
  } catch (error) {
    return next(error);
  }
};

const edit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    userIdCheck(req);
    const strategy = req.body;
    await StrategyRepository.updateStrategy(
      { ...strategy },
      getUserIdFromRequest(req),
    );
    res
      .status(StatusCodes.OK)
      .json({ msg: "updated strategy: " + strategy.name });
  } catch (error) {
    return next(error);
  }
};

const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    userIdCheck(req);
    const { screeners, name, description, period } = req.body;
    const row = await StrategyRepository.createStrategy(
      [{ name, screeners, description, period }],
      getUserIdFromRequest(req),
    );
    res.status(StatusCodes.OK).json({ id: row.insertId });
  } catch (error) {
    return next(error);
  }
};

const deleteStrategy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error400("No ID passed for strategy deletion");
    }
    await StrategyRepository.deleteStrategy(parseInt(id));
    res.status(StatusCodes.OK).json({ message: "Deleted strategy" });
  } catch (error) {
    return next(error);
  }
};

const deleteMultiple = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.query;
    if (!id) {
      throw new Error400("No ID(s) passed for strategy deletion");
    }
    const idArr = new Array<number>();
    if (Array.isArray(id) && id.every((item) => typeof item === "string")) {
      idArr.push(...id.map((item) => parseInt(item)));
    } else if (typeof id === "string") {
      idArr.push(parseInt(id));
    } else {
      throw new Error400("Invalid ID(s) passed for strategy deletion");
    }
    await StrategyRepository.deleteStrategies(idArr);
    res.status(StatusCodes.OK).json({ message: "Deleted strategies" });
  } catch (error) {
    return next(error);
  }
};

// Define routes
strategyRouter.get("/get-by-name", getByName);
strategyRouter.get("/all", getAll);
strategyRouter.get("/names", getAllNames);
strategyRouter.put("/:id", edit);
strategyRouter.post("/", create);
strategyRouter.delete("/:id", deleteStrategy);
strategyRouter.delete("/", deleteMultiple);

export {
  getByName,
  getAll,
  getAllNames,
  edit,
  create,
  deleteStrategy,
  deleteMultiple,
};
export default strategyRouter;
