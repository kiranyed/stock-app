class BaseError extends Error {
  statusCode: number;
  isOperational: boolean;
  description: string = "";
  constructor(description: string, statusCode: number, isOperational = false) {
    super(description);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    //Error.captureStackTrace(this);
  }
}

export default BaseError;
