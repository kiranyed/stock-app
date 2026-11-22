import { Router, Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import cors from "cors";
import { authMiddleware } from "../middleware/auth-middleware";
import { errorCatcher, errorMiddleware } from "../middleware/error-middleware";
import { StockDataUtil } from "../shared/utilities/stock-data-util";
import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import StockGroupRepository from "../shared/services/repos/stock-group-repository";
import { getUserIdFromRequest, userIdCheck } from "../middleware/shared-funcs";
import runRouter from "./run-router";
import strategyRouter from "./strategy-router";
import analysisRouter from "./analysis-router";
import transactionRouter from "./transaction-router";
import tradeRouter from "./trade-router";
import groupRouter from "./group-router";
import utilRouter from "./util-router";

const router = Router();

// Middleware
router.use(cors());
router.use(authMiddleware);

const checkIfString = (value: unknown): value is string =>
  typeof value === "string";

const parseSymbolsValue = (symbols: unknown): string[] => {
  if (Array.isArray(symbols)) {
    return symbols.map(String).map((symbol) => symbol.trim()).filter(Boolean);
  }
  if (typeof symbols !== "string") {
    return [];
  }
  const trimmed = symbols.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((symbol) => symbol.trim()).filter(Boolean);
    }
    return [String(parsed).trim()].filter(Boolean);
  } catch {
    return trimmed
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);
  }
};

const resolveSymbols = async (
  req: Request,
  symbols: unknown,
  groupId: unknown,
): Promise<string> => {
  const normalizedSymbols = parseSymbolsValue(symbols);
  if (normalizedSymbols.length > 0) {
    return normalizedSymbols.join(",");
  }

  if (!checkIfString(groupId)) {
    throw new Error400("Either symbols or groupId must be provided");
  }

  const parsedGroupId = Number.parseInt(groupId, 10);
  if (!Number.isInteger(parsedGroupId) || parsedGroupId <= 0) {
    throw new Error400("groupId must be a positive integer");
  }

  userIdCheck(req);
  const userId = getUserIdFromRequest(req);
  const rows = await StockGroupRepository.getGroupById(parsedGroupId);
  const group = rows[0];

  if (!group || group.user_id !== userId) {
    throw new Error404(`Stock group ${parsedGroupId} not found`);
  }

  const groupSymbols = parseSymbolsValue(group.symbols);
  if (groupSymbols.length === 0) {
    throw new Error400(`Stock group ${parsedGroupId} has no symbols`);
  }

  return groupSymbols.join(",");
};

const getCandleData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let obj;
    const {
      symbols,
      groupId,
      earningsTime,
      timeRange,
      startTime,
      endTime,
      frequencyMinutes,
      useClose,
    } = req.query;
    const symbolStr = await resolveSymbols(req, symbols, groupId);
    if (
      checkIfString(symbolStr) &&
      checkIfString(startTime) &&
      checkIfString(endTime) &&
      checkIfString(frequencyMinutes)
    ) {
      if (
        earningsTime &&
        timeRange &&
        checkIfString(timeRange) &&
        checkIfString(earningsTime)
      ) {
        obj = await StockDataUtil.getCandlesForStock(
          symbolStr,
          earningsTime,
          timeRange,
        );
      } else {
        obj = await StockDataUtil.getCandleData(
          symbolStr,
          startTime,
          endTime,
          parseInt(frequencyMinutes, 10),
          !!useClose,
        );
      }
      if (!obj) {
        throw new Error("Retrieving candle data failed");
      }
    } else {
      throw new Error400("Invalid params, they all must be strings");
    }
    res.status(StatusCodes.OK).json({ obj });
  } catch (error) {
    return next(error);
  }
};

// Routes
router.get("/candle-data", getCandleData);
router.use("/group", groupRouter);
router.use("/strategy", strategyRouter);
router.use("/analysis", analysisRouter);
router.use("/run", runRouter);
router.use("/transaction", transactionRouter);
router.use("/trade", tradeRouter);
router.use("/util", utilRouter);
router.use(errorCatcher);
router.use(errorMiddleware);
export default router;
export { getCandleData };
