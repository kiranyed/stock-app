import mysql, { QueryError } from "mysql2";
import { StockTradeUtil } from "../utilities/stock-trade";
import dotenv from "dotenv";
import { IRange } from "../../types/back-test-types";

type SqlRow<T> = T[];
/* this connects to and makes transactions with the mySQL DB */

dotenv.config();

export class DatabaseAPI {
  private static connection: mysql.Connection | null = null;
  private static awsConnection: mysql.Connection;
  private static connectionPromise: Promise<void> | null = null;

  public static connectionExists() {
    return (
      !!this.connection &&
      (this.connection.state === "authenticated" ||
        this.connection.state === "connected")
    );
  }

  // public static createAWSDBConnection() {
  //     dotenv.config();
  //     const { AWS_DB_HOST, DB_USER, DB_PASSWORD, DB_SCHEMA_NAME } = process.env;
  //     return new Promise<void>((resolve, reject) => {

  //         /* will need to pass in the password through command line*/
  //         this.awsConnection = mysql.createConnection({
  //             host: AWS_DB_HOST,
  //             user: DB_USER,
  //             password: DB_PASSWORD,
  //           });
  //         this.awsConnection.connect(err => {
  //             if (err) {
  //                 reject(err);
  //             } else {
  //                 resolve();
  //             }
  //         });
  //     }).then(() => {
  //         return this.runQuery(`use ${DB_SCHEMA_NAME}`, true);
  //     });
  // }

  public static createConnection(test = false) {
    dotenv.config();
    let host: string;
    let user: string;
    let password: string;
    let schemaName: string;
    if (test) {
      const { TEST_DB_HOST, TEST_DB_USER, TEST_DB_PASSWORD, DB_SCHEMA_NAME } =
        process.env;

      host = TEST_DB_HOST ?? "";
      user = TEST_DB_USER ?? "";
      password = TEST_DB_PASSWORD ?? "";
      schemaName = DB_SCHEMA_NAME ?? "";
    } else {
      const { DB_HOST, DB_USER, DB_PASSWORD, DB_SCHEMA_NAME } = process.env;
      host = DB_HOST ?? "";
      user = DB_USER ?? "";
      password = DB_PASSWORD ?? "";
      schemaName = DB_SCHEMA_NAME ?? "";
    }
    if (this.connectionExists()) {
      return Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      /* will need to pass in the password through command line*/
      this.connection = mysql.createConnection({
        host,
        user,
        password,
        database: schemaName,
        multipleStatements: true,
      });

      this.connection.on("error", (err: QueryError) => {
        if (err.code === "PROTOCOL_CONNECTION_LOST") {
          this.connectionPromise = null;
          this.connection = null as unknown as mysql.Connection;
        }
      });

      this.connection.connect((err: QueryError | null) => {
        if (err) {
          this.connectionPromise = null;
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return this.connectionPromise;
  }

  public static closeConnection() {
    return new Promise<void>((resolve, reject) => {
      this.connection!.end((err: QueryError | null) => {
        if (err) {
          reject(err);
        }
        this.connectionPromise = null;
        this.connection = null as unknown as mysql.Connection;
        console.log("Connection closed");
        resolve();
      });
    });
  }

  /* general function to pass the query string and run it like that  */
  public static async runQuery<T>(query: string, isRetry = false): Promise<SqlRow<T>> {
    if (!this.connectionExists()) {
      await this.createConnection();
    }

    const con = this.connection;
    return new Promise<SqlRow<T>>((resolve, reject) => {
      con!.query(query, async (err: QueryError | null, data: unknown) => {
        if (err) {
          const errorCode = (err as QueryError).code;
          const errorMessage = (err as QueryError).message || "";
          
          // If connection is closed/lost and we haven't retried yet, reset and retry
          if (!isRetry && (errorCode === "PROTOCOL_CONNECTION_LOST" || errorMessage.includes("connection is in closed state"))) {
            this.connectionPromise = null;
            this.connection = null as unknown as mysql.Connection;
            try {
              const result = await this.runQuery<T>(query, true);
              resolve(result);
            } catch (retryErr) {
              reject(retryErr);
            }
          } else {
            reject(err);
          }
        } else {
          resolve(data as SqlRow<T>);
        }
      });
    });
  }

  public static async startTransaction(): Promise<void> {
    if (!this.connectionExists()) {
      await this.createConnection();
    }
    const connection = this.connection!; // Assuming you have a method to get the connection.
    return new Promise<void>((resolve, reject) => {
      connection.beginTransaction((err: QueryError | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public static async rollbackTransaction(): Promise<void> {
    if (!this.connectionExists()) {
      await this.createConnection();
    }
    const connection = this.connection!; // Assuming you have a method to get the connection.
    return new Promise<void>((resolve, reject) => {
      connection.rollback((err: QueryError | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public static async runTwoStatements<T>(
    query1: string,
    query2: string,
  ): Promise<SqlRow<T>> {
    if (!this.connectionExists()) {
      await this.createConnection();
    }
    const connection = this.connection!; // Assuming you have a method to get the connection.

    try {
      await new Promise<void>((resolve, reject) => {
        connection.beginTransaction((err: QueryError | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      await this.runQuery(query1); // Execute the INSERT query

      const rows = await this.runQuery<T>(query2); // Execute the SELECT query

      await new Promise<void>((resolve, reject) => {
        connection.commit((err: QueryError | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      return rows; // Return the rows
    } catch (error) {
      await new Promise<void>((resolve, reject) => {
        connection.rollback((err: QueryError | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      throw error; // Re-throw the error
    }
  }

  public static runInsertQuery(query: string, aws = false) {
    const con = aws ? this.awsConnection : this.connection;
    return new Promise<{ insertId: number }>((resolve, reject) => {
      con!.query<mysql.ResultSetHeader>(
        query,
        (err: QueryError | null, data: mysql.ResultSetHeader) => {
          if (err) {
            reject(err);
          }
          resolve({ insertId: data.insertId });
        },
      );
    });
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
  /* get specified strategies */

  // public static closeAWSConnection() {
  //     return new Promise<void>((resolve, reject) => {
  //         if (this.awsConnection) {
  //             this.awsConnection.end((err) => {
  //                 if (err) {
  //                     reject(err);
  //                 } else {
  //                     console.log('AWS connection closed');
  //                     resolve();
  //                 }
  //             });
  //         } else {
  //             resolve();
  //         }
  //     });
  // }

  public static closeDBConnection() {
    return new Promise<void>((resolve, reject) => {
      if (this.connection) {
        this.connection.end((err: QueryError | null) => {
          if (err) {
            reject(err);
          } else {
            this.connectionPromise = null;
            console.log("DB connection closed");
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
