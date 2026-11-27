import { TransactionEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export type TransactionKind = "simulation";

const TABLE: Record<TransactionKind, string> = { simulation: "transaction_sim" };

/**
 * `transaction_sim` / `transaction_real` rows: closed trades of live runs. A transaction belongs to
 * whoever owns its run's strategy (run_id → live_job → strategy.user_id). Every value is a placeholder.
 */
export default class TransactionRepository {
  /** Records a simulated trade. Never rejects: see `record`. */
  public static recordTransactionSim(
    symbol: string,
    datetime: number,
    profit: number,
    percent: number,
    long: boolean,
    runId: number,
  ) {
    return this.record("simulation", symbol, datetime, profit, percent, long, runId);
  }

  /** The user's transactions for `runIds` newer than `since`; other users' runs are left out. */
  public static getOwnedTransactions(
    kind: TransactionKind,
    runIds: number[],
    userId: number,
    since = 0,
  ): Promise<TransactionEntity[]> {
    if (!runIds.length) return Promise.resolve([]);
    return DatabaseAPI.query<TransactionEntity>(
      `select t.run_id, t.symbol, t.datetime, t.net_gain, t.net_percent_gain, t.\`long\` from ${TABLE[kind]} t ` +
        "join live_job j on j.id = t.run_id join strategy s on s.id = j.strategy_id " +
        "where t.run_id in (?) and s.user_id = ? and t.datetime > ? order by t.datetime",
      [runIds, userId, since],
    );
  }

  /**
   * The trading loop calls the record methods without awaiting them, so a failure here must not
   * become an unhandled rejection (Node exits on those). It is logged and the id is undefined.
   */
  private static async record(
    kind: TransactionKind,
    symbol: string,
    datetime: number,
    profit: number,
    percent: number,
    long: boolean,
    runId: number,
  ): Promise<number | undefined> {
    try {
      if (!runId) throw new Error("runId not set");
      return await DatabaseAPI.insert(
        `insert into ${TABLE[kind]} (symbol, datetime, net_gain, net_percent_gain, \`long\`, run_id) values (?, ?, ?, ?, ?, ?)`,
        [symbol, datetime, profit, percent, long, runId],
      );
    } catch (err) {
      console.error(`Failed to record ${kind} transaction for run ${runId} (${symbol}):`, err);
      return undefined;
    }
  }
}
