import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error409 extends BaseError {
  constructor(description = "Conflict.", statusCode = StatusCodes.CONFLICT, isOperational = true) {
    super(description, statusCode, isOperational);
  }
}

export default Error409;
