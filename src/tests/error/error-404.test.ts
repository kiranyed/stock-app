import { StatusCodes } from "http-status-codes";
import Error404 from "../../errors/error-404";

describe("Error404", () => {
  it("should create an instance of Error404 with the correct properties", () => {
    const description = "Not Found";
    const statusCode = StatusCodes.NOT_FOUND;
    const isOperational = true;

    const error = new Error404(description);

    expect(error).toBeInstanceOf(Error404);
    expect(error.message).toBe(description);
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(isOperational);
  });

  it('should default description to "Not found." if not provided', () => {
    const statusCode = StatusCodes.NOT_FOUND;
    const isOperational = true;

    const error = new Error404();

    expect(error.message).toBe("Not found.");
    expect(error.statusCode).toBe(statusCode);
    expect(error.isOperational).toBe(isOperational);
  });

  it("should have a stack trace", () => {
    const description = "Not Found";

    const error = new Error404(description);

    expect(error.stack).toBeDefined();
  });
});
