import AppServer from "../../startup/app-server";
import express from "express";

jest.mock("express", () => {
  const useMock = jest.fn();
  const listenMock = jest.fn();
  const setMock = jest.fn();
  const getMock = jest.fn();
  const staticMock = jest.fn(); // Mock express.static

  // Mock the Router function to return an object with relevant methods
  const RouterMock = jest.fn().mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
    use: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  });

  // Mock the express function to return an object with relevant methods
  const expressMock = jest.fn(() => ({
    use: useMock,
    listen: listenMock,
    set: setMock,
    get: getMock,
  }));

  // Attach static properties to the express function
  (expressMock as jest.Mock & { static: jest.Mock }).static = staticMock;
  Object.assign(expressMock, {
    json: jest.fn(() => (req: unknown, res: unknown, next: () => void) => next()),
    urlencoded: jest.fn(() => (req: unknown, res: unknown, next: () => void) => next()),
  });

  (expressMock as jest.Mock & { Router: jest.Mock }).Router = RouterMock;

  return {
    __esModule: true, // Ensure the mock works with ES module imports
    default: expressMock,
    Router: RouterMock,
  };
});

jest.mock("../../routers/run-router");
jest.mock("../../routers/analysis-router");
jest.mock("../../routers/util-router");
jest.mock("../../routers/strategy-router");
jest.mock("../../routers/group-router");
jest.mock("../../routers/app-router");
jest.mock("../../routers/user-router");

describe("AppServer", () => {
  let appServer: AppServer;

  beforeEach(() => {
    appServer = new AppServer();
  });

  it("should initialize the server with the correct settings", () => {
    expect(appServer).toBeInstanceOf(AppServer);
    expect(express.json).toHaveBeenCalled();
    expect(express.urlencoded).toHaveBeenCalledWith({ extended: true });
  });

  it("should have the correct server start message", () => {
    appServer.start(3000);
    expect(express().listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("should correctly serve front-end in production", () => {
    process.env.NODE_ENV = "production";
    //(express.static as unknown as jest.Mock).mockReturnValue((req: unknown, res: unknown, next: () => void) => next());
    appServer["serveFrontEndProd"](); // Manually trigger the front-end serving method
    expect(express().set).toHaveBeenCalledWith("views", expect.any(String));
    expect(express().use).toHaveBeenCalledWith(expect.any(Function));
    expect(express.static).toHaveBeenCalledWith(expect.any(String));
  });
});
