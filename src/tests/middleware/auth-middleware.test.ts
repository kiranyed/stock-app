import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../../middleware/auth-middleware";
import Error401 from "../../errors/error-401";

// Uses the real jsonwebtoken library: what matters is how its own errors are classified.
const SECRET = "test-secret";

const run = (headers: Record<string, unknown>) => {
  const req = { headers } as unknown as Request;
  const next = jest.fn();
  authMiddleware(req, {} as Response, next);
  return { req, err: next.mock.calls[0][0], next };
};

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

describe("authMiddleware", () => {
  it("sets user-id from a valid token, overwriting what the client sent", () => {
    const token = jwt.sign({ sub: 123 }, SECRET);
    const { req, err } = run({ "x-access-token": token, "user-id": "999" });
    expect(err).toBeUndefined();
    expect(req.headers["user-id"]).toBe(123);
  });

  it.each([
    ["missing", {}, "Token is missing"],
    ["malformed", { "x-access-token": "not-a-jwt" }, "Invalid token"],
    ["signed with another secret", { "x-access-token": jwt.sign({ sub: 1 }, "other") }, "Invalid token"],
    ["expired", { "x-access-token": jwt.sign({ sub: 1, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET) }, "Token expired"],
    ["not active yet", { "x-access-token": jwt.sign({ sub: 1 }, SECRET, { notBefore: 3600 }) }, "Invalid token"],
    ["without a numeric sub", { "x-access-token": jwt.sign({ sub: "1" }, SECRET) }, "Invalid token"],
  ])("answers a %s token with 401", (_, headers, message) => {
    const { err } = run(headers);
    expect(err).toBeInstanceOf(Error401);
    expect(err.message).toBe(message);
  });

  it("treats a tampered token as invalid", () => {
    const [h, , s] = jwt.sign({ sub: 1 }, SECRET).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: 2 })).toString("base64url");
    expect(run({ "x-access-token": `${h}.${forged}.${s}` }).err).toBeInstanceOf(Error401);
  });

  it("passes a missing server secret on as a server error", () => {
    const token = jwt.sign({ sub: 1 }, SECRET);
    delete process.env.JWT_SECRET;
    const { err } = run({ "x-access-token": token });
    expect(err).not.toBeInstanceOf(Error401);
    expect(err.message).toBe("JWT_SECRET is not set");
  });
});
