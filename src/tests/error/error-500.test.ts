import Error500 from "../../errors/error-500";
import { StatusCodes } from "http-status-codes";

describe("Error500", () => {
  it("should initialize correctly with default parameters", () => {
    const error = new Error500();

    expect(error.message).toBe("Not found.");
    expect(error.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(error.isOperational).toBe(true);
  });

  it("should initialize correctly with given parameters", () => {
    const description = "Internal server error";
    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    const isOperational = true;

    const error = new Error500(description, statusCode, isOperational);

    expect(error.message).toBe(description);
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(isOperational);
  });
});
