import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Error400 from "../../errors/error-400";
import UserRepository from "../../shared/services/repos/user-repository";
import Error500 from "../../errors/error-500";
import Error401 from "../../errors/error-401";
import { createUser, login } from "../../routers/user-router";

jest.mock("bcrypt");
jest.mock("jsonwebtoken");
jest.mock("../../shared/services/repos/user-repository");

describe("userRouter", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    req = {
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    next = jest.fn();
  });

  describe("createUser", () => {
    it("should create a user and return the result", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockHash = "hashedpassword";
      const mockUser = { id: 1, username: "testuser" };

      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);
      (UserRepository.createUser as jest.Mock).mockResolvedValue(mockUser);

      const next = jest.fn(); // Mock next function to catch errors

      await createUser(req as Request, res as Response, next);

      expect(bcrypt.hash).toHaveBeenCalledWith(
        "testpassword1",
        expect.any(Number),
      );
      expect(UserRepository.createUser).toHaveBeenCalledWith(
        "testuser",
        mockHash,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        message: "Successfully created user testuser",
      });

      expect(next).not.toHaveBeenCalled(); // Ensure no errors occurred
    });

    it("should throw Error400 if password does not meet criteria", async () => {
      req.body = {
        username: "testuser",
        password: "short",
      };

      await createUser(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        new Error400(
          "password must be Minimum eight characters, at least one letter and one number",
        ),
      );
    });

    it("should call next with the error on failure", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockError = new Error500("Test Error");
      (bcrypt.hash as jest.Mock).mockRejectedValue(mockError);

      await createUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });

  describe("login", () => {
    it("should login a user and return a token", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockUser = [
        { id: 1, username: "testuser", password: "hashedpassword" },
      ];
      const mockToken = "jsonwebtoken";

      (UserRepository.getPassAndIdForUser as jest.Mock).mockResolvedValue(
        mockUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue(mockToken);

      await login(req as Request, res as Response, next);

      expect(UserRepository.getPassAndIdForUser).toHaveBeenCalledWith(
        "testuser",
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(
        req.body.password,
        mockUser[0].password,
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: mockUser[0].id, role: "user" },
        expect.any(String),
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        token: mockToken,
        user: mockUser[0].username,
      });
    });

    it("should throw Error400 if username or password is incorrect", async () => {
      req.body = {
        username: "testuser",
        password: "wrongpassword",
      };

      const mockUser = [
        { id: 1, username: "testuser", password: "hashedpassword" },
      ];

      (UserRepository.getPassAndIdForUser as jest.Mock).mockResolvedValue(
        mockUser,
      );

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await login(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(new Error401("Invalid password"));
    });

    it("should call next with the error on failure", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockError = new Error("Test Error");

      (UserRepository.getPassAndIdForUser as jest.Mock).mockRejectedValue(
        mockError,
      );

      await login(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
  describe("createUser", () => {
    it("should create a user and return the result", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockHash = "hashedpassword";
      const mockUser = { id: 1, username: "testuser" };

      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);
      (UserRepository.createUser as jest.Mock).mockResolvedValue(mockUser);

      await createUser(req as Request, res as Response, next);

      expect(bcrypt.hash).toHaveBeenCalledWith(
        "testpassword1",
        expect.any(Number),
      );
      expect(UserRepository.createUser).toHaveBeenCalledWith(
        "testuser",
        mockHash,
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({
        message: "Successfully created user testuser",
      });
    });

    it("should throw Error400 if password does not meet criteria", async () => {
      req.body = {
        username: "testuser",
        password: "short",
      };

      await createUser(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledWith(
        new Error400(
          "password must be Minimum eight characters, at least one letter and one number",
        ),
      );
    });

    it("should call next with the error on failure", async () => {
      req.body = {
        username: "testuser",
        password: "testpassword1",
      };

      const mockError = new Error("Test Error");
      (bcrypt.hash as jest.Mock).mockRejectedValue(mockError);

      await createUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(mockError);
    });
  });
});
