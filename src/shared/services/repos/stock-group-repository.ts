import { IStockGroupEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class StockGroupRepository {
  private static runQuery<T = IStockGroupEntity>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }

  public static getGroups(ids: number[]) {
    return this.runQuery(
      `select * from stock_group where id in (${ids.join(",")})`,
    );
  }
  public static getGroup(id: number) {
    return this.runQuery(`select * from stock_group where id=${id}`);
  }

  public static getGroupByName(name: string, userId: number) {
    return this.runQuery(
      `select * from stock_group where user_id=${userId} and name='${name}'`,
    );
  }

  public static getGroupById(id: number) {
    return this.runQuery(`select * from stock_group where id=${id}`);
  }

  public static getAllStockGroups(userId: number) {
    return this.runQuery(`select * from stock_group where user_id=${userId}`);
  }

  public static getAllStockGroupNames(userId: number) {
    return this.runQuery(
      `select id, name from stock_group where user_id=${userId}`,
    );
  }

  public static createGroup(
    name: string,
    symbols: string[],
    userId: number,
  ): Promise<Record<number, Record<number, Record<string, number>>>> {
    return this.runQuery(
      "insert into stock_group (name, symbols, date_added, user_id) values ('" +
        name +
        "', '" +
        JSON.stringify(symbols) +
        "'," +
        Date.now() +
        "," +
        userId +
        ");  SELECT LAST_INSERT_ID();",
    );
  }

  public static saveGroup(name: string, symbols: string[], id: number) {
    return this.runQuery(
      "update stock_group set name='" +
        name +
        "', symbols='" +
        JSON.stringify(symbols) +
        "' where id=" +
        id,
    );
  }

  public static deleteGroup(id: string) {
    return this.runQuery("delete from stock_group where id=" + id);
  }

  public static deleteGroups(ids: string[]) {
    const str = ids.reduce(
      (prev, cur, idx) => (idx === 0 ? cur : prev + "," + cur),
      "",
    );
    return this.runQuery("delete from stock_group where id in (" + str + ")");
  }

  public static getSymbolsFromGroup(group: string, userId: number) {
    return this.runQuery<{ symbols: string }>(
      "select symbols, id from stock_group where name='" +
        group +
        "' and user_id=" +
        userId,
    );
  }

  public static getSymbolsFromGroupById(id: number) {
    return this.runQuery<{ symbols: string }>(
      "select symbols from stock_group where id=" + id,
    );
  }
}
