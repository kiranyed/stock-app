import { Request, Response } from "express";
import BaseError from "../../errors/base-error";
import Error500 from "../../errors/error-500";
import {
  errorCatcher,
  errorMiddleware,
} from "../../middleware/error-middleware";

describe("errorCatcher", () => {
  it("should pass BaseError to next without modification", async () => {
    const err = new BaseError("Base error", 400);
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn();

    await errorCatcher(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it("should capture stack trace and pass Error500 to next for non-BaseError", async () => {
    const err = new Error("Generic error");
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn();

    await errorCatcher(err, req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error500));
    expect((next.mock.calls[0][0] as Error500).message).toBe("Generic error");
  });
});

describe("errorMiddleware", () => {
  it("should call next if error is not provided", () => {
    const req = {} as Partial<Request>;
    const res = {} as Response;
    const next = jest.fn();

    errorMiddleware(undefined as unknown as BaseError, req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should return the error response with status code and message", () => {
    const err = new BaseError("Base error", 400);
    const req = {} as Partial<Request>;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    errorMiddleware(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ...err, message: "Base error" });
  });
});
