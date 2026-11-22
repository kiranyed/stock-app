import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { validateGroup } from "../middleware/group-middleware";
import StockGroupRepository from "../shared/services/repos/stock-group-repository";
import Error400 from "../errors/error-400";
import { getUserIdFromRequest, userIdCheck } from "../middleware/shared-funcs";
//import { userIdCheck } from '../middleware/shared-funcs';

const router = express.Router();

const normalizeSymbols = (symbols: unknown): string[] => {
  if (Array.isArray(symbols)) {
    return symbols.map(String);
  }

  if (typeof symbols === "string") {
    const trimmed = symbols.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
      return [String(parsed)];
    } catch {
      return [trimmed];
    }
  }

  return [];
};

// Middleware
router.use(validateGroup);
const getStockGroupNames = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    userIdCheck(req);
    const rows = await StockGroupRepository.getAllStockGroupNames(
      getUserIdFromRequest(req),
    ); // using ! because it's  been validated in authMiddleware
    res.status(StatusCodes.OK).json(rows);
  } catch (error) {
    return next(error);
  }
};

const createStockGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { name, symbols } = req.body;
  try {
    userIdCheck(req);
    const formattedSymbols = symbols.map((sym: string) =>
      sym.trim().replace(/\r\n/g, "").replace(/\n/g, ""),
    );
    const rows = await StockGroupRepository.createGroup(
      name,
      formattedSymbols,
      getUserIdFromRequest(req),
    );
    res
      .status(StatusCodes.OK)
      .json({ ...req.body, id: rows[1][0]["LAST_INSERT_ID()"] });
  } catch (error) {
    return next(error);
  }
};

const getStockGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    userIdCheck(req);
    const rows = await StockGroupRepository.getAllStockGroups(
      getUserIdFromRequest(req),
    );
    res
      .status(StatusCodes.OK)
      .json(
        rows.map((row) => ({
          name: row.name,
          id: row.id,
          symbols: normalizeSymbols(row.symbols),
        })),
      );
  } catch (error) {
    return next(error);
  }
};

const saveStockGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { name, symbols, id } = req.body;
  try {
    await StockGroupRepository.saveGroup(name, symbols, id);
    res.status(StatusCodes.OK).json(req.body);
  } catch (error) {
    return next(error);
  }
};

const deleteGroup: express.RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;

  try {
    if (typeof id === "string" && id.length > 0) {
      await StockGroupRepository.deleteGroup(id);
    } else {
      throw new Error400("Must pass a group id");
    }
    res.status(StatusCodes.NO_CONTENT).json({});
  } catch (error) {
    return next(error);
  }
};

const deleteGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.query;
    if (id) {
      if (Array.isArray(id) && id.every((id) => typeof id === "string")) {
        await StockGroupRepository.deleteGroups(id);
      } else if (typeof id === "string") {
        await StockGroupRepository.deleteGroup(id);
      } else {
        throw new Error400("id property must be string or array of strings");
      }
    } else {
      throw new Error400(
        "Must pass an id or multiple ids of stock groups to delete",
      );
    }
    res.status(StatusCodes.NO_CONTENT).json({});
  } catch (error) {
    return next(error);
  }
};

// Register routes
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
