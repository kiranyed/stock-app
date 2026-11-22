import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import {
  validateAnalysisRequest,
  validateVariableCheckRequest,
} from "../middleware/analysis-middleware";
import { BackTestService } from "../run/back-test-service";
import { ScreenerJobService } from "../shared/services/screener-job-service";
import { VariableCheckService } from "../shared/services/variable-check-service";

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

    const { analyses, group } = await ScreenerJobService.setUpAnalysisBackTest(
      period,
      {
        filters: scenarioFilters,
        connectors: Array(scenarioFilters.length - 1).fill("AND"),
      },
      dataFilters,
      groupId,
    );

    const retVal = await BackTestService.runBackTests([analyses], group, {
      startTime,
      endTime,
      analyze: true,
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
