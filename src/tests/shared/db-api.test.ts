import type { DatabaseAPI as DatabaseAPIType } from "../../shared/services/db-api";
import type { StockTradeUtil as StockTradeUtilType } from "../../shared/utilities/stock-trade";

jest.mock("mysql2", () => ({ createPool: jest.fn() }));
jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../../shared/utilities/stock-trade", () => ({
  StockTradeUtil: {
    getMySQLDateStringFromDatetime: jest.fn().mockReturnValue("2024-01-01"),
    getStringSurroundedByQuotes: jest.fn().mockImplementation((s: string) => `'${s}'`),
  },
}));

type Callback = (err: Error | null, data?: unknown) => void;
const ok = (cb: Callback) => cb(null);

const makeConnection = () => ({
  query: jest.fn(),
  beginTransaction: jest.fn(ok),
  rollback: jest.fn(ok),
  release: jest.fn(),
  destroy: jest.fn(),
});
type FakeConnection = ReturnType<typeof makeConnection>;

let connections: FakeConnection[];
let pool: { query: jest.Mock; getConnection: jest.Mock; end: jest.Mock };

const lost = () => Object.assign(new Error("Connection lost"), { code: "PROTOCOL_CONNECTION_LOST" });
const closedState = () => new Error("Can't add new command when connection is in closed state");

/** Holds pool.getConnection's next callback until `open()` is called. */
const holdNextConnection = () => {
  let open: () => void = () => undefined;
  pool.getConnection.mockImplementationOnce((cb: (err: Error | null, con?: FakeConnection) => void) => {
    open = () => {
      const con = makeConnection();
      connections.push(con);
      cb(null, con);
    };
  });
  return () => open();
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

// DatabaseAPI's state is static and a close is final, so each test loads a fresh copy (and of its mocks).
let DatabaseAPI: typeof DatabaseAPIType;
let StockTradeUtil: typeof StockTradeUtilType;
let mysql: { createPool: jest.Mock };

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  ({ DatabaseAPI } = await import("../../shared/services/db-api"));
  ({ StockTradeUtil } = await import("../../shared/utilities/stock-trade"));
  mysql = (await import("mysql2")).default as unknown as { createPool: jest.Mock };
  connections = [];
  pool = {
    query: jest.fn(),
    getConnection: jest.fn((cb: (err: Error | null, con?: FakeConnection) => void) => {
      const con = makeConnection();
      connections.push(con);
      cb(null, con);
    }),
    end: jest.fn(ok),
  };
  mysql.createPool.mockReturnValue(pool);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DatabaseAPI", () => {
  describe("createConnection", () => {
    it("creates one pool with one statement per query, after checking a connection opens", async () => {
      process.env.DB_POOL_SIZE = "4";
      await Promise.all([DatabaseAPI.createConnection(), DatabaseAPI.createConnection()]);
      await DatabaseAPI.createConnection();
      delete process.env.DB_POOL_SIZE;

      expect(mysql.createPool).toHaveBeenCalledTimes(1);
      expect(mysql.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ multipleStatements: false, connectionLimit: 4, waitForConnections: true }),
      );
      expect(connections[0].release).toHaveBeenCalled();
      expect(DatabaseAPI.connectionExists()).toBe(true);
    });

    it("fails, closes the pool, and can be tried again when no connection opens", async () => {
      pool.getConnection.mockImplementationOnce((cb: Callback) => cb(new Error("Access denied")));
      await expect(DatabaseAPI.createConnection()).rejects.toThrow("Access denied");
      expect(pool.end).toHaveBeenCalled();
      expect(DatabaseAPI.connectionExists()).toBe(false);

      await DatabaseAPI.createConnection();
      expect(DatabaseAPI.connectionExists()).toBe(true);
    });
  });

  describe("closeConnection", () => {
    it("ends the pool", async () => {
      await DatabaseAPI.createConnection();
      await DatabaseAPI.closeConnection();
      expect(pool.end).toHaveBeenCalled();
      expect(DatabaseAPI.connectionExists()).toBe(false);
    });

    it("does nothing without a pool", async () => {
      await DatabaseAPI.closeConnection();
      expect(pool.end).not.toHaveBeenCalled();
    });

    it("waits for a pool that is still being created, then ends it", async () => {
      const open = holdNextConnection();
      const creating = DatabaseAPI.createConnection();
      const closing = DatabaseAPI.closeConnection();
      await tick();
      expect(pool.end).not.toHaveBeenCalled();

      open();
      await creating;
      await closing;
      expect(pool.end).toHaveBeenCalled();
      expect(DatabaseAPI.connectionExists()).toBe(false);
    });
  });

  describe("query, insert and modify (placeholders)", () => {
    it("query sends the values separately from the SQL, creating the pool if needed", async () => {
      pool.query.mockImplementation((_sql: string, _params: unknown[], cb: Callback) => cb(null, [{ id: 1 }]));
      await expect(DatabaseAPI.query("select * from t where id = ?", [1])).resolves.toEqual([{ id: 1 }]);
      expect(pool.query).toHaveBeenCalledWith("select * from t where id = ?", [1], expect.any(Function));
    });

    it("insert returns the new id and modify the matched rows", async () => {
      pool.query.mockImplementation((_sql: string, _params: unknown[], cb: Callback) =>
        cb(null, { insertId: 9, affectedRows: 2 }),
      );
      await expect(DatabaseAPI.insert("insert …", [])).resolves.toBe(9);
      await expect(DatabaseAPI.modify("update …", [])).resolves.toBe(2);
    });

    it("retries once on a lost connection", async () => {
      pool.query
        .mockImplementationOnce((_s: string, _p: unknown[], cb: Callback) => cb(lost()))
        .mockImplementationOnce((_s: string, _p: unknown[], cb: Callback) => cb(null, [{ id: 1 }]));
      await expect(DatabaseAPI.query("select 1", [])).resolves.toEqual([{ id: 1 }]);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it("retries any query refused on a closed connection, since it was never sent", async () => {
      pool.query
        .mockImplementationOnce((_s: string, _p: unknown[], cb: Callback) => cb(closedState()))
        .mockImplementationOnce((_s: string, _p: unknown[], cb: Callback) => cb(null, { insertId: 3 }));
      await expect(DatabaseAPI.insert("insert into t values (?)", [1])).resolves.toBe(3);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it("doesn't retry a write whose connection was lost, since it may have run", async () => {
      pool.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(lost()));
      await expect(DatabaseAPI.insert("insert into t values (?)", [1])).rejects.toThrow("Connection lost");
      await expect(DatabaseAPI.modify("update t set a = ?", [1])).rejects.toThrow("Connection lost");
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it("gives up after one retry, and passes other errors straight on", async () => {
      pool.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(lost()));
      await expect(DatabaseAPI.query("select 1", [])).rejects.toThrow("Connection lost");
      expect(pool.query).toHaveBeenCalledTimes(2);

      pool.query.mockReset().mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(new Error("syntax")));
      await expect(DatabaseAPI.query("select 1", [])).rejects.toThrow("syntax");
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it("runQuery sends a finished SQL string without params", async () => {
      pool.query.mockImplementation((_sql: string, cb: Callback) => cb(null, []));
      await DatabaseAPI.runQuery("select 1");
      expect(pool.query).toHaveBeenCalledWith("select 1", expect.any(Function));
    });
  });

  describe("after a close", () => {
    it("refuses queries, loudly, instead of opening a new pool, until createConnection is called", async () => {
      pool.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(null, []));
      await DatabaseAPI.createConnection();
      await DatabaseAPI.closeConnection();

      await expect(DatabaseAPI.query("select 1", [])).rejects.toThrow("refused a query after closeConnection()");
      await expect(DatabaseAPI.insert("insert into t values (?)", [1])).rejects.toThrow("refused");
      await expect(DatabaseAPI.startTransaction()).rejects.toThrow("closed");
      expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("select 1") }));
      expect(mysql.createPool).toHaveBeenCalledTimes(1);
      expect(pool.query).not.toHaveBeenCalled();

      await DatabaseAPI.createConnection();
      await DatabaseAPI.query("select 1", []);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("transactions", () => {
    it("runs every query on one connection until the rollback, then releases it", async () => {
      await DatabaseAPI.startTransaction();
      const [, tx] = connections; // [0] is createConnection's check
      tx.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(null, []));

      await DatabaseAPI.query("select 1", []);
      await DatabaseAPI.modify("update …", []);
      expect(tx.beginTransaction).toHaveBeenCalled();
      expect(tx.query).toHaveBeenCalledTimes(2);
      expect(pool.query).not.toHaveBeenCalled();

      await DatabaseAPI.rollbackTransaction();
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.release).toHaveBeenCalled();
    });

    it("refuses, loudly, a query sent after the rollback instead of committing it through the pool", async () => {
      await DatabaseAPI.startTransaction();
      await DatabaseAPI.rollbackTransaction();

      await expect(DatabaseAPI.modify("update t set a = ?", [1])).rejects.toThrow(
        "refused a query outside the test's transaction",
      );
      expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("update t") }));
      expect(pool.query).not.toHaveBeenCalled();

      // also once the test has closed the connection, and even if something reopens it
      await DatabaseAPI.closeConnection();
      await DatabaseAPI.createConnection();
      await expect(DatabaseAPI.query("select 1", [])).rejects.toThrow("outside the test's transaction");
      expect(pool.query).not.toHaveBeenCalled();

      // a new transaction works as before
      await DatabaseAPI.startTransaction();
      const tx = connections[connections.length - 1];
      tx.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(null, []));
      await DatabaseAPI.query("select 1", []);
      expect(tx.query).toHaveBeenCalledTimes(1);
    });

    it("a query sent while the transaction is opening waits and runs inside it", async () => {
      await DatabaseAPI.createConnection();
      const open = holdNextConnection();
      const starting = DatabaseAPI.startTransaction();
      const querying = DatabaseAPI.query("select 1", []);
      open();
      const tx = connections[connections.length - 1];
      tx.query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(null, [{ id: 1 }]));
      await starting;
      await expect(querying).resolves.toEqual([{ id: 1 }]);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("doesn't retry a lost connection inside a transaction", async () => {
      await DatabaseAPI.startTransaction();
      connections[1].query.mockImplementation((_s: string, _p: unknown[], cb: Callback) => cb(lost()));
      await expect(DatabaseAPI.query("select 1", [])).rejects.toThrow("Connection lost");
      expect(connections[1].query).toHaveBeenCalledTimes(1);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("refuses a second transaction, and a rollback without one", async () => {
      await DatabaseAPI.startTransaction();
      await expect(DatabaseAPI.startTransaction()).rejects.toThrow("already open");
      await DatabaseAPI.rollbackTransaction();
      await expect(DatabaseAPI.rollbackTransaction()).rejects.toThrow("no transaction is open");
    });

    it("refuses a second transaction while the first is still opening", async () => {
      await DatabaseAPI.createConnection();
      const open = holdNextConnection();
      const first = DatabaseAPI.startTransaction();
      await expect(DatabaseAPI.startTransaction()).rejects.toThrow("already open");
      open();
      await first;
      expect(pool.getConnection).toHaveBeenCalledTimes(2); // the check, then the one transaction
    });

    it("rollback waits for a transaction that is still opening", async () => {
      await DatabaseAPI.createConnection();
      const open = holdNextConnection();
      const starting = DatabaseAPI.startTransaction();
      const rolling = DatabaseAPI.rollbackTransaction();
      open();
      await starting;
      await rolling;
      expect(connections[1].rollback).toHaveBeenCalled();
      expect(connections[1].release).toHaveBeenCalled();
    });

    it("closeConnection waits for a transaction that is still opening, then closes it", async () => {
      await DatabaseAPI.createConnection();
      const open = holdNextConnection();
      const starting = DatabaseAPI.startTransaction();
      const closing = DatabaseAPI.closeConnection();
      open();
      await starting;
      await closing;
      expect(connections[1].destroy).toHaveBeenCalled();
      expect(pool.end).toHaveBeenCalled();
      await expect(DatabaseAPI.rollbackTransaction()).rejects.toThrow("no transaction is open");
    });

    it("closes, rather than returns to the pool, a connection whose begin or rollback failed", async () => {
      pool.getConnection.mockImplementationOnce((cb: (err: Error | null, con?: FakeConnection) => void) => {
        const con = makeConnection();
        connections.push(con);
        cb(null, con);
      });
      await DatabaseAPI.createConnection();
      const failing = makeConnection();
      failing.beginTransaction.mockImplementation((cb: Callback) => cb(new Error("begin failed")));
      pool.getConnection.mockImplementationOnce((cb: (err: Error | null, con?: FakeConnection) => void) => cb(null, failing));
      await expect(DatabaseAPI.startTransaction()).rejects.toThrow("begin failed");
      expect(failing.destroy).toHaveBeenCalled();
      expect(failing.release).not.toHaveBeenCalled();

      await DatabaseAPI.startTransaction();
      const tx = connections[connections.length - 1];
      tx.rollback.mockImplementation((cb: Callback) => cb(new Error("rollback failed")));
      await expect(DatabaseAPI.rollbackTransaction()).rejects.toThrow("rollback failed");
      expect(tx.destroy).toHaveBeenCalled();
      expect(tx.release).not.toHaveBeenCalled();
      await expect(DatabaseAPI.rollbackTransaction()).rejects.toThrow("no transaction is open");
    });

    it("closeConnection closes an open transaction's connection", async () => {
      await DatabaseAPI.startTransaction();
      await DatabaseAPI.closeConnection();
      expect(connections[1].destroy).toHaveBeenCalled();
      expect(pool.end).toHaveBeenCalled();
    });
  });

  // ─── getStockNamesEarnings ─────────────────────────────────────────────────

  describe("getStockNamesEarnings", () => {
    beforeEach(() => {
      pool.query.mockImplementation((_q: string, cb: Callback) => cb(null, [{ symbol: "AAPL" }]));
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
