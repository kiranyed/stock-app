import { Response } from "express";
import Error400 from "../../errors/error-400";
import {
  validateAnalysisRequest,
  validateVariableCheckRequest,
} from "../../middleware/analysis-middleware";
import { AuthenticatedRequest } from "../../types/middleware-types";

describe("validateAnalysisRequest", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;
  const fakeGroupId = 1;

  beforeEach(() => {
    req = {
      body: {
        scenarioFilters: [
          {
            varName: "percentchange",
            timeAgo: 2,
            compareVal: "3",
            operator: ">",
          },
        ],
        dataFilters: [
          {
            varName: "percentchange",
            timeAgo: 3,
            compareVal: "4",
            operator: ">",
          },
        ],
        startTime: 1620000000,
        endTime: 1620003600,
        period: 60,
        groupId: fakeGroupId,
      },
    };
    res = {};
    next = jest.fn();
  });

  it("should call next without error for valid request", async () => {
    await validateAnalysisRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(); // Called without error
  });

  it("should call next with Error400 for invalid request payload", async () => {
    req.body = { invalid: "data" }; // Invalid payload

    await validateAnalysisRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(next.mock.calls[0][0].message).toBe(
      "payload is invalid; must contain all the properties of type IAnalysisRequest",
    );
  });

  it("should call next with Error400 if startTime and endTime are invalid integers", async () => {
    req.body.startTime = 3.23;
    req.body.endTime = 4.23;
    await validateAnalysisRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(next.mock.calls[0][0].message).toBe(
      "startTime and endTime must be valid integers",
    );
  });

  it("should call next with Error400 if startTime is greater than or equal to endTime", async () => {
    req.body.startTime = 1620003600;
    req.body.endTime = 1620000000;
    await validateAnalysisRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(next.mock.calls[0][0].message).toBe(
      "startTime must be less than endTime",
    );
  });
});

describe("validateVariableCheckRequest", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      body: {
        variables: [{ varName: "percentchange", timeAgo: "10" }],
        groupId: 99,
      },
    };
    res = {};
    next = jest.fn();
  });

  it("should call next for valid variable check request", async () => {
    await validateVariableCheckRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("should reject when variables is empty", async () => {
    req.body = { variables: [], groupId: 99 };

    await validateVariableCheckRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
  });

  it("should reject when a variable has no varName", async () => {
    req.body = { variables: [{}], groupId: 99 };

    await validateVariableCheckRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
  });
});
