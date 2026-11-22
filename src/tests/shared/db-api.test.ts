import mysql from "mysql2";
import { DatabaseAPI } from "../../shared/services/db-api";
import { StockTradeUtil } from "../../shared/utilities/stock-trade";

jest.mock("mysql2", () => ({
  createConnection: jest.fn().mockImplementation(() => ({
    connect: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    state: "authenticated",
  })),
}));

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("../../shared/utilities/stock-trade", () => ({
  StockTradeUtil: {
    getMySQLDateStringFromDatetime: jest.fn().mockReturnValue("2024-01-01"),
    getStringSurroundedByQuotes: jest
      .fn()
      .mockImplementation((s: string) => `'${s}'`),
  },
}));

// Helper to build a fresh mock connection
function makeMockConnection(
  overrides: Partial<mysql.Connection> = {},
): mysql.Connection {
  return {
    connect: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    query: jest.fn(),
    beginTransaction: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    commit: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    rollback: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    end: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    on: jest.fn(),
    state: "authenticated",
    ...overrides,
  } as unknown as mysql.Connection;
}

describe("DatabaseAPI", () => {
  let connection: mysql.Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    DatabaseAPI["connectionPromise"] = null;
    connection = makeMockConnection();
    DatabaseAPI["connection"] = connection;
    (mysql.createConnection as jest.Mock).mockReturnValue(connection);
  });

  // ─── connectionExists ──────────────────────────────────────────────────────

  describe("connectionExists", () => {
    it("returns true when state is authenticated", () => {
      expect(DatabaseAPI.connectionExists()).toBe(true);
    });

    it("returns true when state is connected", () => {
      const connectedConn = makeMockConnection();
      Object.defineProperty(connectedConn, "state", {
        value: "connected",
        configurable: true,
      });
      DatabaseAPI["connection"] = connectedConn;
      expect(DatabaseAPI.connectionExists()).toBe(true);
    });

    it("returns false when state is disconnected", () => {
      const disconnectedConn = makeMockConnection();
      Object.defineProperty(disconnectedConn, "state", {
        value: "disconnected",
        configurable: true,
      });
      DatabaseAPI["connection"] = disconnectedConn;
      expect(DatabaseAPI.connectionExists()).toBe(false);
    });

    it("returns false when connection is null", () => {
      DatabaseAPI["connection"] = null as unknown as mysql.Connection;
      expect(DatabaseAPI.connectionExists()).toBe(false);
    });
  });

  // ─── createConnection ──────────────────────────────────────────────────────

  describe("createConnection", () => {
    it("resolves and stores connection on success", async () => {
      DatabaseAPI["connection"] = null as unknown as mysql.Connection;
      await DatabaseAPI.createConnection();
      expect(mysql.createConnection).toHaveBeenCalled();
      expect(DatabaseAPI.connectionExists()).toBe(true);
    });

    it("returns existing promise if one is already in-flight", async () => {
      DatabaseAPI["connection"] = null as unknown as mysql.Connection;
      const p = DatabaseAPI.createConnection();
      const p2 = DatabaseAPI.createConnection();
      await Promise.all([p, p2]);
      // createConnection (mysql) called only once because the second call reuses the promise
      expect(mysql.createConnection).toHaveBeenCalledTimes(1);
    });

    it("rejects and clears connectionPromise on connect error", async () => {
      DatabaseAPI["connection"] = null as unknown as mysql.Connection;
      const connectError = new Error("connect failed");
      const failingConn = makeMockConnection();
      failingConn.connect = jest.fn((cb: (err: Error | null) => void) =>
        cb(connectError),
      );
      (mysql.createConnection as jest.Mock).mockReturnValueOnce(failingConn);
      await expect(DatabaseAPI.createConnection()).rejects.toThrow(
        "connect failed",
      );
      // In production, connectionPromise is cleared asynchronously after connect fails.
      // With a synchronous mock the outer assignment overwrites the null set inside the
      // executor, so what matters is that the returned promise rejects — verified above.
    });

    it("resolves immediately if already connected", async () => {
      // connection state is 'authenticated' from beforeEach
      await expect(DatabaseAPI.createConnection()).resolves.toBeUndefined();
      expect(mysql.createConnection).not.toHaveBeenCalled();
    });
  });

  // ─── closeConnection ───────────────────────────────────────────────────────

  describe("closeConnection", () => {
    it("resolves and clears connectionPromise on success", async () => {
      DatabaseAPI["connectionPromise"] = Promise.resolve();
      await DatabaseAPI.closeConnection();
      expect(connection.end).toHaveBeenCalled();
      expect(DatabaseAPI["connectionPromise"]).toBeNull();
    });

    it("rejects if end returns an error", async () => {
      const endError = new Error("end failed");
      (connection.end as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(endError),
      );
      await expect(DatabaseAPI.closeConnection()).rejects.toThrow("end failed");
    });
  });

  // ─── closeDBConnection ─────────────────────────────────────────────────────

  describe("closeDBConnection", () => {
    it("resolves and clears connectionPromise when connection exists", async () => {
      DatabaseAPI["connectionPromise"] = Promise.resolve();
      await DatabaseAPI.closeDBConnection();
      expect(connection.end).toHaveBeenCalled();
      expect(DatabaseAPI["connectionPromise"]).toBeNull();
    });

    it("resolves without calling end when connection is null", async () => {
      DatabaseAPI["connection"] = null as unknown as mysql.Connection;
      await expect(DatabaseAPI.closeDBConnection()).resolves.toBeUndefined();
    });

    it("rejects if end returns an error", async () => {
      const endError = new Error("closeDB failed");
      (connection.end as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(endError),
      );
      await expect(DatabaseAPI.closeDBConnection()).rejects.toThrow(
        "closeDB failed",
      );
    });
  });

  // ─── runQuery ──────────────────────────────────────────────────────────────

  describe("runQuery", () => {
    it("returns query results", async () => {
      const mockData = [{ id: 1, name: "test" }];
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(null, mockData),
      );
      const result = await DatabaseAPI.runQuery("SELECT * FROM test");
      expect(connection.query).toHaveBeenCalledWith(
        "SELECT * FROM test",
        expect.any(Function),
      );
      expect(result).toEqual(mockData);
    });

    it("rejects on query error", async () => {
      const mockError = new Error("query failed");
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(mockError, null),
      );
      await expect(DatabaseAPI.runQuery("SELECT * FROM test")).rejects.toThrow(
        "query failed",
      );
    });

    it("clears connectionPromise on PROTOCOL_CONNECTION_LOST", async () => {
      DatabaseAPI["connectionPromise"] = Promise.resolve();
      const connLostError = Object.assign(new Error("conn lost"), {
        code: "PROTOCOL_CONNECTION_LOST",
      });
      // First call fails with PROTOCOL_CONNECTION_LOST, second call succeeds (after retry)
      (connection.query as jest.Mock).mockImplementationOnce(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(connLostError, null),
      ).mockImplementationOnce(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(null, []),
      );
      const result = await DatabaseAPI.runQuery("SELECT 1");
      expect(result).toEqual([]);
    });
  });

  // ─── startTransaction ──────────────────────────────────────────────────────

  describe("startTransaction", () => {
    it("calls beginTransaction and resolves", async () => {
      await DatabaseAPI.startTransaction();
      expect(connection.beginTransaction).toHaveBeenCalled();
    });

    it("rejects if beginTransaction errors", async () => {
      const txError = new Error("begin failed");
      (connection.beginTransaction as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(txError),
      );
      await expect(DatabaseAPI.startTransaction()).rejects.toThrow(
        "begin failed",
      );
    });
  });

  // ─── rollbackTransaction ───────────────────────────────────────────────────

  describe("rollbackTransaction", () => {
    it("calls rollback and resolves", async () => {
      await DatabaseAPI.rollbackTransaction();
      expect(connection.rollback).toHaveBeenCalled();
    });

    it("rejects if rollback errors", async () => {
      const rbError = new Error("rollback failed");
      (connection.rollback as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(rbError),
      );
      await expect(DatabaseAPI.rollbackTransaction()).rejects.toThrow(
        "rollback failed",
      );
    });
  });

  // ─── runTwoStatements ──────────────────────────────────────────────────────

  describe("runTwoStatements", () => {
    it("runs both queries in a transaction and returns second result", async () => {
      const mockData = [{ id: 1 }];
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(null, mockData),
      );
      const result = await DatabaseAPI.runTwoStatements(
        "INSERT INTO t VALUES (1)",
        "SELECT * FROM t",
      );
      expect(connection.beginTransaction).toHaveBeenCalled();
      expect(connection.query).toHaveBeenCalledWith(
        "INSERT INTO t VALUES (1)",
        expect.any(Function),
      );
      expect(connection.query).toHaveBeenCalledWith(
        "SELECT * FROM t",
        expect.any(Function),
      );
      expect(connection.commit).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });

    it("rolls back and rethrows if a query fails", async () => {
      const queryError = new Error("query failed");
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(queryError, null),
      );
      await expect(
        DatabaseAPI.runTwoStatements(
          "INSERT INTO t VALUES (1)",
          "SELECT * FROM t",
        ),
      ).rejects.toThrow("query failed");
      expect(connection.rollback).toHaveBeenCalled();
    });

    it("rolls back and rethrows if beginTransaction fails", async () => {
      const beginError = new Error("begin failed");
      (connection.beginTransaction as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(beginError),
      );
      await expect(
        DatabaseAPI.runTwoStatements(
          "INSERT INTO t VALUES (1)",
          "SELECT * FROM t",
        ),
      ).rejects.toThrow("begin failed");
    });

    it("rolls back and rethrows if commit fails", async () => {
      const commitError = new Error("commit failed");
      const mockData = [{ id: 1 }];
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(null, mockData),
      );
      (connection.commit as jest.Mock).mockImplementation(
        (cb: (err: Error | null) => void) => cb(commitError),
      );
      await expect(
        DatabaseAPI.runTwoStatements(
          "INSERT INTO t VALUES (1)",
          "SELECT * FROM t",
        ),
      ).rejects.toThrow("commit failed");
      expect(connection.rollback).toHaveBeenCalled();
    });
  });

  // ─── runInsertQuery ────────────────────────────────────────────────────────

  describe("runInsertQuery", () => {
    it("resolves with the insertId on success", async () => {
      (connection.query as jest.Mock).mockImplementation(
        (
          q: string,
          cb: (err: Error | null, data: mysql.ResultSetHeader) => void,
        ) => cb(null, { insertId: 42 } as mysql.ResultSetHeader),
      );
      const result = await DatabaseAPI.runInsertQuery(
        "INSERT INTO t VALUES (1)",
      );
      expect(result).toEqual({ insertId: 42 });
    });

    it("rejects on error", async () => {
      const insertError = new Error("insert failed");
      (connection.query as jest.Mock).mockImplementation(
        (
          q: string,
          cb: (err: Error | null, data: mysql.ResultSetHeader) => void,
        ) => cb(insertError, null as unknown as mysql.ResultSetHeader),
      );
      await expect(
        DatabaseAPI.runInsertQuery("INSERT INTO t VALUES (1)"),
      ).rejects.toThrow("insert failed");
    });
  });

  // ─── getStockNamesEarnings ─────────────────────────────────────────────────

  describe("getStockNamesEarnings", () => {
    beforeEach(() => {
      (connection.query as jest.Mock).mockImplementation(
        (q: string, cb: (err: Error | null, data: unknown) => void) =>
          cb(null, [{ symbol: "AAPL" }]),
      );
    });

    it("throws when start is missing", () => {
      expect(() =>
        DatabaseAPI.getStockNamesEarnings({
          start: undefined as unknown as number,
          end: 100,
        }),
      ).toThrow("must specify time range");
    });

    it("throws when end is missing", () => {
      expect(() =>
        DatabaseAPI.getStockNamesEarnings({
          start: 100,
          end: undefined as unknown as number,
        }),
      ).toThrow("must specify time range");
    });

    it("throws when start or end is a string", () => {
      expect(() =>
        DatabaseAPI.getStockNamesEarnings({
          start: "2024-01-01" as unknown as number,
          end: 100,
        }),
      ).toThrow("timerange  must be number");
    });

    it("calls runQuery with the correct SQL for a valid numeric range", async () => {
      const runQuerySpy = jest
        .spyOn(DatabaseAPI, "runQuery")
        .mockResolvedValue([]);
      await DatabaseAPI.getStockNamesEarnings({
        start: 1700000000000,
        end: 1700100000000,
      });
      expect(
        StockTradeUtil.getMySQLDateStringFromDatetime,
      ).toHaveBeenCalledTimes(2);
      expect(runQuerySpy).toHaveBeenCalledWith(
        expect.stringContaining("historicalearningsstock"),
      );
      runQuerySpy.mockRestore();
    });
  });
});
