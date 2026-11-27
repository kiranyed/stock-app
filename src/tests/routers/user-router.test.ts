import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createUser, login } from "../../routers/user-router";
import { UserService } from "../../services/user-service";

jest.mock("../../services/user-service");

const service = UserService as jest.Mocked<typeof UserService>;

const call = async (
  handler: (req: Request, res: Response, next: jest.Mock) => Promise<unknown>,
  body: unknown,
) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ body } as Request, res as unknown as Response, next);
  return { res, next };
};

beforeEach(() => jest.clearAllMocks());

describe("user routes", () => {
  it("register answers in the shape the frontend reads", async () => {
    service.register.mockResolvedValue({ id: 4, username: "alice" });
    const { res } = await call(createUser, { username: "alice", password: "Passw0rd9" });
    expect(service.register).toHaveBeenCalledWith("alice", "Passw0rd9");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ message: "Successfully created user alice", id: 4 });
  });

  it("login returns the token and user", async () => {
    service.login.mockResolvedValue({ token: "t", user: "alice" });
    const { res } = await call(login, { username: "alice", password: "Passw0rd9" });
    expect(res.json).toHaveBeenCalledWith({ token: "t", user: "alice" });
  });

  it("send service errors and a missing body to the error handler", async () => {
    const failure = new Error("bad");
    service.login.mockRejectedValue(failure);
    const { next } = await call(login, undefined);
    expect(service.login).toHaveBeenCalledWith(undefined, undefined);
    expect(next).toHaveBeenCalledWith(failure);
  });
});
