import BaseError from "../../errors/base-error";

describe("BaseError", () => {
  it("should initialize correctly with given parameters", () => {
    const description = "Test error";
    const statusCode = 400;
    const isOperational = true;

    const error = new BaseError(description, statusCode, isOperational);

    expect(error.message).toBe(description);
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(isOperational);
  });

  it("should initialize correctly with default isOperational parameter", () => {
    const description = "Test error";
    const statusCode = 400;

    const error = new BaseError(description, statusCode);

    expect(error.message).toBe(description);
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(false);
  });
});
