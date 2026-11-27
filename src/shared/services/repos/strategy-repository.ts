import { IRunHistoryCount, IStrategyEntity, NewType } from "../../../types/entity-types";
import { IStrategy } from "../../../types/strategy-types";
import { DatabaseAPI } from "../db-api";
import { SCREENERS_VERSION } from "../../../services/strategy-schema";

type IStrategyFields = Pick<IStrategy, "name" | "description" | "period" | "screeners">;

/** `strategy` rows. Every value goes through a placeholder. */
export default class StrategyRepository {
  /** The strategies among `ids` that `userId` owns. */
  public static getOwnedStrategies(ids: number[], userId: number): Promise<IStrategyEntity[]> {
    if (!ids.length) return Promise.resolve([]);
    return DatabaseAPI.query<IStrategyEntity>("select * from strategy where id in (?) and user_id = ?", [ids, userId]);
  }

  public static getStrategy(strategyId: number) {
    return DatabaseAPI.query<IStrategyEntity>("select * from strategy where id = ?", [strategyId]);
  }

  public static getStrategies(strategyIds: number[]) {
    if (!strategyIds.length) return Promise.resolve([] as IStrategyEntity[]);
    return DatabaseAPI.query<IStrategyEntity>("select * from strategy where id in (?)", [strategyIds]);
  }

  public static getAllStrategies(userId: number) {
    return DatabaseAPI.query<IStrategyEntity>("select * from strategy where user_id = ?", [userId]);
  }

  public static getAllNames(userId: number) {
    return DatabaseAPI.query<{ id: number; name: string }>(
      "select id, name from strategy where user_id = ?",
      [userId],
    );
  }

  public static getByName(names: string[], userId: number): Promise<IStrategyEntity[]> {
    if (!names.length) return Promise.resolve([]);
    return DatabaseAPI.query<IStrategyEntity>(
      "select * from strategy where name in (?) and user_id = ?",
      [names, userId],
    );
  }

  /** Inserts the strategies (one statement) and returns the first new id. */
  public static async createStrategy(
    strategies: NewType<IStrategyFields>[],
    userId: number,
  ): Promise<{ insertId: number }> {
    const now = Date.now();
    const rows = strategies.map((s) => [
      s.name,
      JSON.stringify(s.screeners),
      SCREENERS_VERSION,
      s.description,
      now,
      s.period,
      userId,
    ]);
    const insertId = await DatabaseAPI.insert(
      "insert into strategy (name, screeners, screeners_version, description, date_added, period, user_id) values ?",
      [rows],
    );
    return { insertId };
  }

  /** Updates the strategy if `userId` owns it; returns how many rows matched (0 or 1). */
  public static updateStrategy(id: number, userId: number, strategy: IStrategyFields): Promise<number> {
    return DatabaseAPI.modify(
      "update strategy set period = ?, description = ?, screeners = ?, screeners_version = ?, name = ? where id = ? and user_id = ?",
      [strategy.period, strategy.description, JSON.stringify(strategy.screeners), SCREENERS_VERSION, strategy.name, id, userId],
    );
  }

  /** The ids among `ids` that `userId` owns. */
  public static async getOwnedIds(ids: number[], userId: number): Promise<number[]> {
    if (!ids.length) return [];
    const rows = await DatabaseAPI.query<{ id: number }>(
      "select id from strategy where id in (?) and user_id = ?",
      [ids, userId],
    );
    return rows.map((row) => row.id);
  }

  /** For each of `ids` that `userId` owns: how many runs and saved back-test results use it. */
  public static getHistoryCounts(ids: number[], userId: number): Promise<IRunHistoryCount[]> {
    if (!ids.length) return Promise.resolve([]);
    return DatabaseAPI.query<IRunHistoryCount>(
      "select s.id, s.name, " +
        "(select count(*) from live_job j where j.strategy_id = s.id) as runs, " +
        "(select count(*) from backtest_result b where b.strategy_id = s.id) as backtests " +
        "from strategy s where s.id in (?) and s.user_id = ?",
      [ids, userId],
    );
  }

  /** Deletes the strategies `userId` owns among `ids`; returns how many were deleted. */
  public static deleteStrategies(ids: number[], userId: number): Promise<number> {
    if (!ids.length) return Promise.resolve(0);
    return DatabaseAPI.modify("delete from strategy where id in (?) and user_id = ?", [ids, userId]);
  }
}
