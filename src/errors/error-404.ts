import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error404 extends BaseError {
  constructor(
    description = "Not found.",
    statusCode = StatusCodes.NOT_FOUND,
    isOperational = true,
  ) {
    super(description, statusCode, isOperational);
  }
}

export default Error404;
