import { IRunHistoryCount, IStockGroupEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

/** `stock_group` rows. Every value goes through a placeholder. */
export default class StockGroupRepository {
  public static getGroups(ids: number[]) {
    if (!ids.length) return Promise.resolve([] as IStockGroupEntity[]);
    return DatabaseAPI.query<IStockGroupEntity>("select * from stock_group where id in (?)", [ids]);
  }

  public static getGroup(id: number) {
    return DatabaseAPI.query<IStockGroupEntity>("select * from stock_group where id = ?", [id]);
  }

  public static getGroupById(id: number) {
    return this.getGroup(id);
  }

  /** The group if `userId` owns it; otherwise nothing. */
  public static getOwnedGroup(id: number, userId: number) {
    return DatabaseAPI.query<IStockGroupEntity>(
      "select * from stock_group where id = ? and user_id = ?",
      [id, userId],
    );
  }

  public static getGroupByName(name: string, userId: number) {
    return DatabaseAPI.query<IStockGroupEntity>(
      "select * from stock_group where user_id = ? and name = ?",
      [userId, name],
    );
  }

  public static getAllStockGroups(userId: number) {
    return DatabaseAPI.query<IStockGroupEntity>("select * from stock_group where user_id = ?", [userId]);
  }

  public static getAllStockGroupNames(userId: number) {
    return DatabaseAPI.query<IStockGroupEntity>(
      "select id, name from stock_group where user_id = ?",
      [userId],
    );
  }

  /** Inserts the group and returns its id. */
  public static createGroup(name: string, symbols: string[], userId: number): Promise<number> {
    return DatabaseAPI.insert(
      "insert into stock_group (name, symbols, date_added, user_id) values (?, ?, ?, ?)",
      [name, JSON.stringify(symbols), Date.now(), userId],
    );
  }

  /** Updates the group if `userId` owns it; returns how many rows matched (0 or 1). */
  public static updateGroup(id: number, userId: number, name: string, symbols: string[]): Promise<number> {
    return DatabaseAPI.modify(
      "update stock_group set name = ?, symbols = ? where id = ? and user_id = ?",
      [name, JSON.stringify(symbols), id, userId],
    );
  }

  /** The ids among `ids` that `userId` owns. */
  public static async getOwnedIds(ids: number[], userId: number): Promise<number[]> {
    if (!ids.length) return [];
    const rows = await DatabaseAPI.query<{ id: number }>(
      "select id from stock_group where id in (?) and user_id = ?",
      [ids, userId],
    );
    return rows.map((row) => row.id);
  }

  /** For each of `ids` that `userId` owns: how many runs and saved back-test results use it. */
  public static getHistoryCounts(ids: number[], userId: number): Promise<IRunHistoryCount[]> {
    if (!ids.length) return Promise.resolve([]);
    return DatabaseAPI.query<IRunHistoryCount>(
      "select g.id, g.name, " +
        "(select count(*) from live_job j where j.group_id = g.id) as runs, " +
        "(select count(*) from backtest_result b where b.group_id = g.id) as backtests " +
        "from stock_group g where g.id in (?) and g.user_id = ?",
      [ids, userId],
    );
  }

  /** Deletes the groups `userId` owns among `ids`; returns how many were deleted. */
  public static deleteGroups(ids: number[], userId: number): Promise<number> {
    if (!ids.length) return Promise.resolve(0);
    return DatabaseAPI.modify("delete from stock_group where id in (?) and user_id = ?", [ids, userId]);
  }

  public static getSymbolsFromGroup(group: string, userId: number) {
    return DatabaseAPI.query<{ symbols: string; id: number }>(
      "select symbols, id from stock_group where name = ? and user_id = ?",
      [group, userId],
    );
  }
}
