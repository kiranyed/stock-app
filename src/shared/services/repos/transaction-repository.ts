import {
  ILiveJobRunEntity,
  Transaction,
  TransactionEntity,
} from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class TransactionRepository {
  static updateTransaction(transaction: Transaction, real = true) {
    const tableName = real ? "transaction_real" : "transaction_sim";
    return this.runQuery(
      `update ${tableName} set quantity=${transaction.quantity} where id=${transaction.id}`,

    );
  }
  private static runQuery<T = Transaction>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }

  /* insert a transaction from a simulation or real strategy into DB */
  public static recordTransaction(
    symbol: string,
    datetime: number,
    profit: number,
    percent: number,
    long: boolean,
    runId: number,
  ) {
    if (runId === 0) {
      throw new Error("runId not set");
    }
    const valueString = [symbol, datetime, profit, percent, long, runId]
      .map((param) => (typeof param === "string" ? "'" + param + "'" : param))
      .join(",");
    const query =
      "insert into transaction_real (symbol, datetime, net_gain, net_percent_gain, long, run_id) values (" +
      valueString +
      ")";
    return this.runQuery<number>(query);
  }

  public static recordTransactionSim(
    symbol: string,
    datetime: number,
    profit: number,
    percent: number,
    long: boolean,
    runId: number,
  ) {
    if (runId === 0) {
      throw new Error("runId not set");
    }
    const valueString = [symbol, datetime, profit, percent, long, runId]
      .map((param) => (typeof param === "string" ? "'" + param + "'" : param))
      .join(",");
    const query =
      "insert into transaction_sim (symbol, datetime, net_gain, net_percent_gain, long, run_id) values (" +
      valueString +
      ")";
    return this.runQuery(query);
  }

  public static getTransactionsReal(runIds: string[], datetime?: number) {
    let dt = 0;
    if (datetime) {
      dt = datetime;
    }
    const query =
      "select run_id, symbol, datetime, net_percent_gain from transaction_real where run_id in (" +
      runIds.join(",") +
      ") and datetime > " +
      dt;
    return this.runQuery<TransactionEntity>(query);
  }

  public static getTransactionsSimulation(runIds: string[], datetime?: number) {
    let dt = 0;
    if (datetime) {
      dt = datetime;
    }
    const query =
      "select run_id, symbol, datetime, net_percent_gain from transaction_sim where run_id in (" +
      runIds.join(",") +
      ") and datetime > " +
      dt;
    return this.runQuery<TransactionEntity>(query);
  }

  public static getTransactionsForRun(runId: number) {
    return this.runQuery(
      "select net_percent_gain from transaction_sim where run_id=" + runId,
    );
  }

  public static getTotal(runRows: ILiveJobRunEntity[]) {
    return this.runQuery<{ gainPercent: number; id: number }>(
      "select SUM(net_percent_gain) as gainPercent, run_id from transaction_sim where run_id in (" +
        runRows.map((row) => row.id).join(",") +
        ")",
    );
  }
}
