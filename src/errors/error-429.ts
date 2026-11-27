import BaseError from "./base-error";
import { StatusCodes } from "http-status-codes";

class Error429 extends BaseError {
  constructor(description = "Too many requests.", statusCode = StatusCodes.TOO_MANY_REQUESTS, isOperational = true) {
    super(description, statusCode, isOperational);
  }
}

export default Error429;
