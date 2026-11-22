import { AuthenticatedRequest } from "../../types/middleware-types";
import Error400 from "../../errors/error-400";
import { validateTransactionRequest } from "../../middleware/transaction-middleware";
import { NextFunction, Response } from "express";

describe("validateTransactionRequest", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    req = { query: {} };
    res = {} as Partial<Response>;
    next = jest.fn();
  });

  it("should throw Error400 if pingTime is undefined", () => {
    req.query = { runId: "testRunId" };
    expect(() =>
      validateTransactionRequest(
        req as AuthenticatedRequest,
        res as Response,
        next,
      ),
    ).toThrow(Error400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should throw Error400 if pingTime is an array", () => {
    req.query = { pingTime: ["1622505600"], runId: "testRunId" };
    expect(() =>
      validateTransactionRequest(
        req as AuthenticatedRequest,
        res as Response,
        next,
      ),
    ).toThrow(Error400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should throw Error400 if pingTime is not an integer", () => {
    req.query = { pingTime: "invalid", runId: "testRunId" };
    expect(() =>
      validateTransactionRequest(
        req as AuthenticatedRequest,
        res as Response,
        next,
      ),
    ).toThrow(Error400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should throw Error400 if runId is not provided", () => {
    req.query = { pingTime: "1622505600" };
    expect(() =>
      validateTransactionRequest(
        req as AuthenticatedRequest,
        res as Response,
        next,
      ),
    ).toThrow(Error400);
    expect(next).not.toHaveBeenCalled();
  });

  it("should pass validation if pingTime and runId are valid", () => {
    req.query = { pingTime: "1622505600", runId: "testRunId" };
    validateTransactionRequest(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );
    expect(next).toHaveBeenCalled();
  });
});
