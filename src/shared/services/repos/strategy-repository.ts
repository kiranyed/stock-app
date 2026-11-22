import { IStrategyEntity, NewType } from "../../../types/entity-types";
import { IStrategy } from "../../../types/strategy-types";
import { DatabaseAPI } from "../db-api";

const USERID = "user_id";
export default class StrategyRepository {
  private static runQuery<T = IStrategyEntity>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }

  private static runInsertQuery(query: string) {
    return DatabaseAPI.runInsertQuery(query);
  }

  public static checkStrategiesExist(strategyIds: string[]) {
    return this.runQuery<{ count: number }>(
      `select count(*) from strategy where id in (${strategyIds.join(",")})`,
    ).then((rows) => (rows[0].count = strategyIds.length));
  }

  public static getStrategy(strategyId: number) {
    return this.runQuery<IStrategyEntity>(
      `select * from strategy where id=${strategyId}`,
    );
  }

  public static getStrategies(strategyIds: number[]) {
    return this.runQuery<IStrategyEntity>(
      `select * from strategy where id in (${strategyIds.join(",")})`,
    );
  }

  public static getAllStrategies(userId: number) {
    return this.runQuery<IStrategyEntity>(
      `select * from strategy where user_id=${userId}`,
    );
  }

  public static deleteStrategy(id: number) {
    return this.runQuery<number>("delete from strategy where id=" + id).then(
      (rows) => rows[0],
    );
  }

  public static deleteStrategies(ids: number[]) {
    const str = ids.reduce(
      (prev, cur, idx) => (idx === 0 ? cur.toString() : prev + "," + cur),
      "",
    );
    return this.runQuery("delete from strategy where id in (" + str + ")");
  }

  public static getStrategyIds(names: string[], userId: number) {
    return this.runQuery(
      `select id from strategy where name in '(${names.join(",")})' and user_id=${userId}`,
    );
  }

  public static getStrategyById(id: number) {
    return this.runQuery(`select 1 from strategy where id=${id}`);
  }

  public static createStrategy(
    strategyObjs: NewType<IStrategy>[],
    userId: number,
  ): Promise<{ insertId: number }> {
    let query =
      "insert into strategy (name, screeners, description, date_added, period, user_id) values ";

    for (let i = 0; i < strategyObjs.length; i++) {
      if (i > 0) {
        query += ", ";
      }
      query +=
        "('" +
        strategyObjs[i].name +
        "','" +
        JSON.stringify(strategyObjs[i].screeners) +
        "','" +
        strategyObjs[i].description +
        "'," +
        Date.now() +
        "," +
        strategyObjs[i].period +
        ", " +
        userId +
        ")";
    }
    return this.runInsertQuery(query);
  }

  public static getByName(
    strategies: string[],
    userId: number,
  ): Promise<IStrategyEntity[]> {
    const namesWithQuotes = strategies.map((strat) => "'" + strat + "'");
    const query =
      "select * from strategy where name in (" +
      namesWithQuotes.join(",") +
      ") and user_id=" +
      userId;
    return this.runQuery(query);
  }

  public static getAllNames(userId: number) {
    return this.runQuery(
      `select id, name from strategy where user_id=${userId}`,
    );
  }

  public static get(id: number) {
    return this.runQuery("select * from strategy where id=" + id);
  }

  public static updateStrategy(strategy: IStrategy, userId: number) {
    return this.runQuery<number>(
      `update strategy set period=${strategy.period}, description='${strategy.description}', 
            screeners='${JSON.stringify(strategy.screeners)}', name='${strategy.name}' 
            where id=${strategy.id} and ${USERID}=${userId}`,
    ).then((rows) => rows[0]);
  }
}
