import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error400 extends BaseError {
  constructor(
    description = "Not found.",
    statusCode = StatusCodes.BAD_REQUEST,
    isOperational = true,
  ) {
    super(description, statusCode, isOperational);
  }
}

export default Error400;
