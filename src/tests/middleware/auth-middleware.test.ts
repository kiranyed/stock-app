import { Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import { authMiddleware } from "../../middleware/auth-middleware";
import { AuthenticatedRequest } from "../../types/middleware-types";
import Error401 from "../../errors/error-401";
import Error400 from "../../errors/error-400";

jest.mock("jsonwebtoken");

describe("authMiddleware", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    req = {
      headers: {
        "x-access-token": "test-token",
        "user-id": "",
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it("should set userId in context if token is valid", () => {
    const mockClaims = { sub: 123 };
    (jwt.verify as jest.Mock).mockReturnValue(mockClaims);

    authMiddleware(req as AuthenticatedRequest, res as Response, next);

    expect(jwt.verify).toHaveBeenCalledWith("test-token", "test-secret");
    expect(req.headers).toStrictEqual({
      "user-id": 123,
      "x-access-token": "test-token",
    });
    expect(next).toHaveBeenCalled();
  });

  it("should return 401 if token is invalid", () => {
    const mockError = new Error401("Invalid token");
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw mockError;
    });

    authMiddleware(req as AuthenticatedRequest, res as Response, next);
    expect(jwt.verify).toHaveBeenCalledWith("test-token", "test-secret");
    expect(next).toHaveBeenCalledWith(new Error401("Invalid token"));
  });

  it("should return 401 if token is missing", () => {
    req.headers = { "user-id": "" };

    authMiddleware(req as AuthenticatedRequest, res as Response, next);
    expect(next).toHaveBeenCalledWith(new Error400("Token is missing"));
  });
});
