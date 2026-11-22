jest.mock("../../startup/app-server");
jest.mock("../../shared/services/trading-api");
jest.mock("../../shared/services/db-api");
jest.mock("dotenv");

describe("start.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  // when using import, the module is loaded asynchronously, versus require()
  it("should boot in order and start the server", async () => {
    const MockAppServer = jest.requireMock("../../startup/app-server")
      .default as jest.Mock;
    const { DatabaseAPI: MockDatabaseAPI } = jest.requireMock(
      "../../shared/services/db-api",
    ) as { DatabaseAPI: { createConnection: jest.Mock } };
    const { SchwabAPI: MockSchwabAPI } = jest.requireMock(
      "../../shared/services/trading-api",
    ) as { SchwabAPI: { initialize: jest.Mock } };
    const mockDotenv = jest.requireMock("dotenv") as { config: jest.Mock };

    const mockStart = jest.fn();
    MockAppServer.mockImplementation(() => ({
      start: mockStart,
    }));
    MockDatabaseAPI.createConnection.mockResolvedValue(undefined);
    MockSchwabAPI.initialize.mockResolvedValue(undefined);

    await import("../../startup/start");
    await Promise.resolve();

    expect(mockDotenv.config).toHaveBeenCalled();
    expect(MockDatabaseAPI.createConnection).toHaveBeenCalled();
    expect(MockSchwabAPI.initialize).toHaveBeenCalled();
    expect(MockAppServer).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith(3001);
  });

  it("should not start the server if DB initialization fails", async () => {
    const MockAppServer = jest.requireMock("../../startup/app-server")
      .default as jest.Mock;
    const { DatabaseAPI: MockDatabaseAPI } = jest.requireMock(
      "../../shared/services/db-api",
    ) as { DatabaseAPI: { createConnection: jest.Mock } };

    const mockStart = jest.fn();
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    MockAppServer.mockImplementation(() => ({
      start: mockStart,
    }));
    MockDatabaseAPI.createConnection.mockRejectedValue(new Error("db down"));

    await import("../../startup/start");
    await Promise.resolve();

    expect(mockStart).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Startup failed", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

});
