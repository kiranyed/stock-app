import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import request from "supertest";
import BaseError from "../../errors/base-error";
import Error400 from "../../errors/error-400";
import Error500 from "../../errors/error-500";
import {
  errorCatcher,
  errorMiddleware,
  INTERNAL_ERROR_MESSAGE,
} from "../../middleware/error-middleware";

const req = { method: "GET", originalUrl: "/x" } as Request;

beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe("errorCatcher", () => {
  it("passes our own errors through unchanged", () => {
    const err = new Error400("bad input");
    const next = jest.fn();
    errorCatcher(err, req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it("replaces any other error with a generic 500 and logs the original", () => {
    const err = new Error("You have an error in your SQL syntax near ''x''' at line 1");
    const next = jest.fn();
    errorCatcher(err, req, {} as Response, next);
    const sent = next.mock.calls[0][0] as Error500;
    expect(sent).toBeInstanceOf(Error500);
    expect(sent.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("GET /x"), err);
  });

  it("keeps client errors that Express marks as safe to show", () => {
    const err = Object.assign(new SyntaxError("Unexpected token"), { status: 400, expose: true });
    const next = jest.fn();
    errorCatcher(err, req, {} as Response, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400, message: "Unexpected token" });
  });

  it("does not trust an expose flag on a server error", () => {
    const err = Object.assign(new Error("secret detail"), { status: 500, expose: true });
    const next = jest.fn();
    errorCatcher(err, req, {} as Response, next);
    expect((next.mock.calls[0][0] as Error).message).toBe(INTERNAL_ERROR_MESSAGE);
  });
});

describe("errorMiddleware", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as unknown as Response;

  it("calls next when there is no error", () => {
    const next = jest.fn();
    errorMiddleware(undefined as unknown as BaseError, req, res(), next);
    expect(next).toHaveBeenCalled();
  });

  it("sends only the status code and message", () => {
    const r = res();
    errorMiddleware(new Error400("bad input"), req, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith({ statusCode: 400, message: "bad input" });
  });
});

describe("in an app", () => {
  const app = express();
  app.use(bodyParser.json());
  app.get("/db", () => {
    throw Object.assign(new Error("ER_PARSE_ERROR: ... near 'x' at line 1"), { sql: "select * from user where name = 'x''" });
  });
  app.get("/ours", () => {
    throw new Error400("name must be alphanumeric");
  });
  app.post("/json", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorCatcher, errorMiddleware);

  it("never sends a database error's text or SQL", async () => {
    const res = await request(app).get("/db");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ statusCode: 500, message: INTERNAL_ERROR_MESSAGE });
    expect(res.text).not.toMatch(/ER_PARSE|select|line 1/);
  });

  it("sends our own messages", async () => {
    const res = await request(app).get("/ours");
    expect(res.body).toEqual({ statusCode: 400, message: "name must be alphanumeric" });
  });

  it("answers malformed JSON with a 400 and no stack trace", async () => {
    const res = await request(app).post("/json").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(Object.keys(res.body)).toEqual(["statusCode", "message"]);
    expect(res.text).not.toMatch(/node_modules|\n\s+at /);
  });
});
