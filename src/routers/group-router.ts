import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { GroupService } from "../services/group-service";
import { parseId, parseIds } from "../services/parse";
import { requireUserId as userOf } from "../middleware/shared-funcs";

const router = express.Router();

const getStockGroupNames = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await GroupService.listNames(userOf(req)));
  } catch (error) {
    return next(error);
  }
};

const getStockGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await GroupService.list(userOf(req)));
  } catch (error) {
    return next(error);
  }
};

const createStockGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(StatusCodes.OK).json(await GroupService.create(userOf(req), req.body ?? {}));
  } catch (error) {
    return next(error);
  }
};

const saveStockGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = await GroupService.update(userOf(req), parseId(req.params.id), req.body ?? {});
    res.status(StatusCodes.OK).json(group);
  } catch (error) {
    return next(error);
  }
};

const deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await GroupService.remove(userOf(req), [parseId(req.params.id)]);
    res.status(StatusCodes.NO_CONTENT).json({});
  } catch (error) {
    return next(error);
  }
};

/** DELETE /api/group?id=1&id=2 */
const deleteGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.query;
    const ids = parseIds(id);
    await GroupService.remove(userOf(req), ids);
    res.status(StatusCodes.NO_CONTENT).json({});
  } catch (error) {
    return next(error);
  }
};

router.get("/names", getStockGroupNames);
router.post("/", createStockGroup);
router.get("/all", getStockGroups);
router.put("/:id", saveStockGroup);
router.delete("/:id", deleteGroup);
router.delete("/", deleteGroups);

export {
  getStockGroupNames,
  createStockGroup,
  getStockGroups,
  saveStockGroup,
  deleteGroup,
  deleteGroups,
};
export default router;
