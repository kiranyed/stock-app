import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error401 extends BaseError {
  constructor(
    description = "Unauthorized",
    statusCode = StatusCodes.UNAUTHORIZED,
    isOperational = true,
  ) {
    super(description, statusCode, isOperational);
  }
}

export default Error401;
