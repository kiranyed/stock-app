import Error400 from "../../errors/error-400";
import { StatusCodes } from "http-status-codes";

describe("Error400", () => {
  it("should initialize correctly with default parameters", () => {
    const error = new Error400();

    expect(error.message).toBe("Not found.");
    expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
    expect(error.isOperational).toBe(true);
  });

  it("should initialize correctly with given parameters", () => {
    const description = "Bad request error";
    const statusCode = StatusCodes.BAD_REQUEST;
    const isOperational = true;

    const error = new Error400(description, statusCode, isOperational);

    expect(error.message).toBe(description);
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(isOperational);
  });
});
