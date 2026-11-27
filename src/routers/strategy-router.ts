import { Request, Router, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../errors/error-400";
import { requireUserId as userOf } from "../middleware/shared-funcs";
import { parseId, parseIds } from "../services/parse";
import { StrategyService } from "../services/strategy-service";

const strategyRouter = Router();

/** GET /api/strategy/get-by-name?name=a&name=b (the frontend calls /getByName) */
const getByName = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.query;
    const names = Array.isArray(name) ? name : [name];
    if (!names.length || !names.every((n): n is string => typeof n === "string")) {
      throw new Error400("invalid name parameter");
    }
    res.status(StatusCodes.OK).json({ strategies: await StrategyService.getByNames(userOf(req), names) });
  } catch (error) {
    return next(error);
  }
};

const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json({ strategies: await StrategyService.list(userOf(req)) });
  } catch (error) {
    return next(error);
  }
};

const getAllNames = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await StrategyService.listNames(userOf(req)));
  } catch (error) {
    return next(error);
  }
};

const edit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const strategy = await StrategyService.update(userOf(req), parseId(req.params.id), req.body);
    res.status(StatusCodes.OK).json({ msg: "updated strategy: " + strategy.name });
  } catch (error) {
    return next(error);
  }
};

const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await StrategyService.create(userOf(req), req.body));
  } catch (error) {
    return next(error);
  }
};

const deleteStrategy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await StrategyService.remove(userOf(req), [parseId(req.params.id)]);
    res.status(StatusCodes.OK).json({ message: "Deleted strategy" });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /api/strategy?id=1&id=2 */
const deleteMultiple = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.query;
    await StrategyService.remove(userOf(req), parseIds(id));
    res.status(StatusCodes.OK).json({ message: "Deleted strategies" });
  } catch (error) {
    return next(error);
  }
};

strategyRouter.get("/get-by-name", getByName);
strategyRouter.get("/getByName", getByName);
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
