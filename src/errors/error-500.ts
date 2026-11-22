import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error500 extends BaseError {
  constructor(
    description = "Not found.",
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    isOperational = true,
  ) {
    super(description, statusCode, isOperational);
  }
}

export default Error500;
