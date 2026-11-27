import mysql, { QueryError } from "mysql2";
import { StockTradeUtil } from "../utilities/stock-trade";
import dotenv from "dotenv";
import { IRange } from "../../types/back-test-types";

type SqlRow<T> = T[];
/* this connects to and makes transactions with the mySQL DB */

dotenv.config();

export class DatabaseAPI {
  private static pool: mysql.Pool | null = null;
  private static poolPromise: Promise<void> | null = null;
  /** While a transaction is open, every query runs on this connection (the integration tests' sandbox). */
  private static pinned: mysql.PoolConnection | null = null;
  private static transactionStarting: Promise<void> | null = null;
  /**
   * Set by the first `startTransaction`: from then on this process only queries inside a
   * transaction. After the test's rollback or close, a query from a timer or job still in
   * flight is refused instead of committing to the real database through the pool.
   */
  private static sandboxed = false;
  /** Set by `closeConnection`, cleared by `createConnection`: a query after the close doesn't reopen the pool. */
  private static closed = false;

  public static connectionExists() {
    return !!this.pool;
  }

  /**
   * Creates the connection pool and checks that one connection can be opened, so bad
   * credentials fail at startup. Size: `DB_POOL_SIZE` (default 10).
   */
  public static createConnection() {
    this.closed = false;
    return this.openPool();
  }

  private static openPool() {
    if (this.pool) return Promise.resolve();
    if (this.poolPromise) return this.poolPromise;

    dotenv.config();
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_SCHEMA_NAME, DB_POOL_SIZE } = process.env;
    const pool = mysql.createPool({
      host: DB_HOST ?? "",
      user: DB_USER ?? "",
      password: DB_PASSWORD ?? "",
      database: DB_SCHEMA_NAME ?? "",
      connectionLimit: Number(DB_POOL_SIZE) || 10,
      waitForConnections: true,
      enableKeepAlive: true,
      // One statement per query: an injected "; drop table …" fails instead of running.
      multipleStatements: false,
    });

    const ready = new Promise<void>((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) {
          pool.end(() => undefined);
          reject(err);
          return;
        }
        connection.release();
        this.pool = pool;
        resolve();
      });
    });
    this.poolPromise = ready;
    // cleared after the assignment above, so a later call can try again
    ready.catch(() => {
      if (this.poolPromise === ready) this.poolPromise = null;
    });
    return ready;
  }

  /**
   * Closes the pool and any open transaction's connection. If the pool or a transaction
   * is still being opened, waits for that to finish first, so it can't come back after the close.
   * Later queries are refused until `createConnection` is called again.
   */
  public static async closeConnection() {
    this.closed = true;
    await this.poolPromise?.catch(() => undefined);
    await this.transactionStarting?.catch(() => undefined);
    const pool = this.pool;
    const pinned = this.pinned;
    this.pinned = null;
    this.pool = null;
    this.poolPromise = null;
    // MySQL rolls back the open transaction when its connection closes
    pinned?.destroy();
    if (!pool) return;
    await new Promise<void>((resolve, reject) => pool.end((err) => (err ? reject(err) : resolve())));
    console.log("Connection closed");
  }

  /**
   * Runs `sql` with `?` placeholders filled from `params`; the driver escapes
   * every value. Use this for anything built from user input.
   */
  public static query<T>(sql: string, params: unknown[] = []): Promise<SqlRow<T>> {
    return this.send<SqlRow<T>>(sql, params);
  }

  /** Runs an INSERT with placeholders and returns the new row's id. */
  public static async insert(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.send<mysql.ResultSetHeader>(sql, params)).insertId;
  }

  /** Runs an UPDATE or DELETE with placeholders and returns how many rows it matched. */
  public static async modify(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.send<mysql.ResultSetHeader>(sql, params)).affectedRows;
  }

  /** Runs a finished SQL string. Older code; new code uses `query` with placeholders. */
  public static runQuery<T>(query: string): Promise<SqlRow<T>> {
    return this.send<SqlRow<T>>(query, undefined);
  }

  private static async send<R>(sql: string, params: unknown[] | undefined, isRetry = false): Promise<R> {
    if (!this.pinned) await this.transactionStarting?.catch(() => undefined);
    if (!this.pinned) {
      if (this.sandboxed) throw this.refuse(sql, "outside the test's transaction, which was rolled back or closed");
      if (this.closed) throw this.refuse(sql, "after closeConnection()");
    }
    if (!this.pool) await this.openPool();
    const target: mysql.Pool | mysql.PoolConnection | null = this.pinned ?? this.pool;
    if (!target) throw new Error("the database connection is closed");

    return new Promise<R>((resolve, reject) => {
      const done = (err: QueryError | null, data: unknown) => {
        if (!err) return resolve(data as R);
        if (!isRetry && target === this.pool && DatabaseAPI.safeToRetry(err, sql)) {
          this.send<R>(sql, params, true).then(resolve, reject);
        } else {
          reject(err);
        }
      };
      if (params === undefined) target.query(sql, done);
      else target.query(sql, params, done);
    });
  }

  /**
   * The pool drops a dead connection, so one more try gets a fresh one. Never inside a
   * transaction (target must be the pool): its connection, and the transaction, are gone.
   * "closed state" means the query was refused before it was sent, so any query can go again.
   * A connection lost mid-query may have run it already, so only reads go again.
   */
  private static safeToRetry(err: QueryError, sql: string) {
    if ((err.message || "").includes("closed state")) return true;
    return err.code === "PROTOCOL_CONNECTION_LOST" && /^\s*(select|show)\b/i.test(sql);
  }

  /**
   * Something still running (a timer, a live job) after its owner shut the database down.
   * Logged as well as thrown, since background callers often catch and carry on.
   */
  private static refuse(sql: string, when: string) {
    const err = new Error(
      `DatabaseAPI refused a query ${when}; something is still running after the test or shutdown: ${sql.slice(0, 120)}`,
    );
    console.error(err);
    return err;
  }

  /**
   * Opens a transaction on one connection; every query runs on it until the rollback.
   * Only the integration tests use this, and from then on queries outside a transaction are refused.
   */
  public static startTransaction(): Promise<void> {
    if (this.pinned || this.transactionStarting) return Promise.reject(new Error("a transaction is already open"));
    if (this.closed) return Promise.reject(new Error("the database connection is closed"));
    this.sandboxed = true;
    const starting = this.openTransaction();
    this.transactionStarting = starting;
    // cleared after the assignment above, as in createConnection
    return starting.finally(() => {
      if (this.transactionStarting === starting) this.transactionStarting = null;
    });
  }

  private static async openTransaction(): Promise<void> {
    if (!this.pool) await this.openPool();
    const pool = this.pool;
    if (!pool) throw new Error("the database connection is closed");
    const connection = await new Promise<mysql.PoolConnection>((resolve, reject) =>
      pool.getConnection((err, con) => (err ? reject(err) : resolve(con))),
    );
    try {
      await new Promise<void>((resolve, reject) =>
        connection.beginTransaction((err) => (err ? reject(err) : resolve())),
      );
    } catch (err) {
      connection.destroy();
      throw err;
    }
    this.pinned = connection;
  }

  /** Rolls back the open transaction. Waits for one that is still being opened. */
  public static async rollbackTransaction(): Promise<void> {
    await this.transactionStarting?.catch(() => undefined);
    const connection = this.pinned;
    if (!connection) throw new Error("no transaction is open");
    this.pinned = null;
    try {
      await new Promise<void>((resolve, reject) => connection.rollback((err) => (err ? reject(err) : resolve())));
    } catch (err) {
      // never hand a connection that may still be inside the transaction back to the pool
      connection.destroy();
      throw err;
    }
    connection.release();
  }

  public static getStockNamesEarnings(timeRange: IRange) {
    let start;
    let end;
    if (!(timeRange.start && timeRange.end)) {
      throw new Error("must specify time range");
    } else if (
      typeof timeRange.start === "string" ||
      typeof timeRange.end === "string"
    ) {
      throw new Error(" timerange  must be number");
    } else {
      start = StockTradeUtil.getMySQLDateStringFromDatetime(timeRange.start);
      end = StockTradeUtil.getMySQLDateStringFromDatetime(timeRange.end);
      const part1 =
        "select symbol from historicalearningsstock where earningsdate between " +
        StockTradeUtil.getStringSurroundedByQuotes(start) +
        " and " +
        StockTradeUtil.getStringSurroundedByQuotes(end);
      return this.runQuery(part1);
    }
  }
}
