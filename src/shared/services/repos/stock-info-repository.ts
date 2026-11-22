import { IRange } from "../../../types/back-test-types";
import { IStockInfoEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class StockInfoRepository {
  public static getStocksByDate(date: Date) {
    const DEFAULT_MIN = 200 * 10 ** 6;
    const dateString =
      date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    return DatabaseAPI.runQuery<IStockInfoEntity>(
      "select * from stockinfo where marketCap > " +
        DEFAULT_MIN +
        " and earningsdate= " +
        dateString,
    );
  }

  /* get list of stocks from the "stockinfo" table */
  public static getStocks(range: IRange): Promise<string[]> {
    const queryStart = "select * from stockinfo where marketCap ";
    const queryEnd =
      range.start && range.end
        ? ">= " + range.start + " and marketCap <= " + range.end
        : range.end
          ? "<= " + range.end
          : range.start
            ? ">= " + range.start
            : "";
    if (!queryEnd) {
      throw new Error("no bounds specified");
    }
    const query = queryStart + queryEnd;
    return DatabaseAPI.runQuery(query);
  }

  public static getStockNamesByDate(date: Date) {
    const DEFAULT_MIN = 200 * 10 ** 6;
    const dateString =
      date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    return DatabaseAPI.runQuery(
      "select symbol from stockinfo where marketCap > " +
        DEFAULT_MIN +
        " and earningsdate= " +
        dateString,
    );
  }

  /* get stock names by market cap */
  public static getStockNames(range: IRange): Promise<string[]> {
    const queryStart = "select symbol from stockinfo where marketCap ";
    const queryEnd =
      range.start && range.end
        ? ">= " + range.start + " and marketCap <= " + range.end
        : range.end
          ? "<= " + range.end
          : range.start
            ? ">= " + range.start
            : "";
    if (!queryEnd) {
      throw new Error("no bounds specified");
    }
    const query = queryStart + queryEnd;
    return DatabaseAPI.runQuery(query);
  }

  public static getStockInfo(symbols: string[]): Promise<IStockInfoEntity[]> {
    return DatabaseAPI.runQuery(
      `select * from stockinfo where symbol in ('${symbols.join("','")}')`,
    );
  }

  /* all stock names from stockinfo table */
  public static getAllStockNames() {
    return DatabaseAPI.runQuery("select symbol from stockinfo");
  }

  public static getStockData(range: IRange, list: string, days = false) {
    const { start, end } = range;
    const tableName = days ? "historicalstockdatadays" : "HistoricalStockData";
    const query =
      "select * from " +
      tableName +
      " where symbol in (" +
      list +
      ") and datetime >= " +
      start +
      " and datetime <= " +
      end +
      " order by datetime";
    return DatabaseAPI.runQuery(query);
  }

  public static getHighCapStocks(list: string) {
    const range = {
      start: "" + 50000000000,
      end: "" + Number.MAX_SAFE_INTEGER,
    };
    return this.getStockData(range, list);
  }

  public static getLowCapStocks(list: string) {
    const range = {
      start: "" + Number.MIN_SAFE_INTEGER,
      end: "" + 50000000000,
    };
    return this.getStockData(range, list);
  }
}
