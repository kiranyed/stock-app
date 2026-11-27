import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  validateAnalysisRequest,
  validateVariableCheckRequest,
} from "../middleware/analysis-middleware";
import { BackTestPool } from "../run/back-test-pool";
import { ScreenerJobService } from "../shared/services/screener-job-service";
import { VariableCheckService } from "../shared/services/variable-check-service";
import { requireUserId as userOf } from "../middleware/shared-funcs";

const router = express.Router();

const getData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body } = req;
    const {
      scenarioFilters,
      period,
      startTime,
      endTime,
      groupId,
      dataFilters,
    } = body;

    const userId = userOf(req);
    const group = await ScreenerJobService.getOwnedGroup(userId, groupId);
    const { results: retVal } = await BackTestPool.run(userId, {
      kind: "analysis",
      period,
      scenarioFilterGroup: {
        filters: scenarioFilters,
        connectors: Array(scenarioFilters.length - 1).fill("AND"),
      },
      dataFilters,
      group,
      config: { startTime, endTime, analyze: true },
    });

    // Return the first element because we only have one analysis
    res.status(StatusCodes.OK).json({ analysisData: retVal[0] });
  } catch (error) {
    return next(error);
  }
};

const checkVariables = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { variables, groupId, startTime, endTime } = req.body;

    const result = await VariableCheckService.getVariableValuesForGroup(
      userOf(req),
      groupId,
      variables,
      startTime,
      endTime,
    );

    res.status(StatusCodes.OK).json(result);
  } catch (error) {
    return next(error);
  }
};

// Apply middleware and register routes
router.post("/get-data", validateAnalysisRequest, getData);
router.post("/check-variables", validateVariableCheckRequest, checkVariables);

export { getData, checkVariables };
export default router;
