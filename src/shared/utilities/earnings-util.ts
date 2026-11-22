import axios from "axios";
import { CONSTANTS } from "../constants";
import { StockTradeUtil } from "./stock-trade";
import { DatabaseAPI } from "../services/db-api";

const MILLIS_IN_DAY = CONSTANTS.MILLIS_IN_DAY;

/* useful functions I created a while back, and just put them all into one 'util' class */
export class EarningsUtil {
  private simulation = false;

  /* gets html from earningswhispers.com */
  public static getEarningsCalendarStocks(dValue: number): Promise<string[]> {
    return axios
      .get(
        "https://www.earningswhispers.com/calendar?sb=p&d=" +
          dValue +
          "&t=all&v=s",
      )
      .then((resp) => this.parseHTMLFile(resp.data));
  }

  /* if the html is in a file, read from that file and call parseHTMLFile */
  public static async parseHTMLFileFromFileName(
    fileName: string,
  ): Promise<string[]> {
    return StockTradeUtil.readFile(fileName).then((string) => {
      return this.parseHTMLFile(string);
      // return this.parseForDate(string);
    });
  }

  /* get date */
  public static parseForDate(file: string) {
    const beginString = "Earnings Calendar for ";
    const dateBeginIdx = file.indexOf(beginString) + beginString.length;
    const dateEndIdx = file.indexOf("</title>", dateBeginIdx);
    const date = file.substring(dateBeginIdx, dateEndIdx).trim();
    return date;
  }

  // handle case where number of names is over 100
  static getJoinStatement = async (date: Date, stockNames: string[]) => {
    const dateString =
      "'" +
      date.getFullYear() +
      "-" +
      (date.getMonth() + 1) +
      "-" +
      date.getDate() +
      "'";
    const namesWithQuotes = stockNames.map((name) => "'" + name + "'");
    const listString = namesWithQuotes.join(",");
    let statement = "JOIN (\r\n";
    const names = await DatabaseAPI.runQuery<{ symbol: string }>(
      "select symbol from stockinfotest where symbol in (" + listString + ")",
    );

    // not sure if this is the right check
    if (names.length === 0) {
      return "";
    }
    names.forEach((name, i) => {
      const symbol = name.symbol;
      const stockName = "'" + symbol + "'";
      if (i === 0) {
        statement +=
          "SELECT " + stockName + " as sym, " + dateString + " as newdate\r\n";
      } else {
        statement +=
          "union all\r\nselect " + stockName + ", " + dateString + "\r\n";
      }
      const idx = stockNames.indexOf(symbol.toUpperCase());
      if (idx > -1) {
        stockNames.splice(idx, 1);
      }
    });
    statement += ") ";
    return statement;
  };

  /* insert info into the DB */
  static insertNewValues = async (stockNames: string[], date: Date) => {
    const strings = new Array<string>();
    const dateString =
      date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    stockNames.forEach((name, i) => {
      const valueString =
        i < stockNames.length - 1
          ? "('" + name + "'" + ", '" + dateString + "')\r\n"
          : "('" + name + "'" + ", '" + dateString + "')";
      strings.push(valueString);
    });
    await DatabaseAPI.runQuery(
      "insert ignore into stockinfotest (symbol, earningsdate) values " +
        strings.join(","),
    );
  };

  /* parse the HTML page and get the individual stocks, and store into the DB */
  public static async parseHTMLFile(file: string): Promise<string[]> {
    let curIdx = 0;
    let start: number;
    let stop: number;
    const day1Stocks = new Array<string>();
    const day2Stocks = new Array<string>();
    const timeNow = StockTradeUtil.getEastCoastDate();
    let theDate =
      timeNow.getDay() < 5
        ? new Date(Date.now() + MILLIS_IN_DAY)
        : new Date(Date.now() + MILLIS_IN_DAY * 3);
    theDate = StockTradeUtil.getEastCoastDate(theDate);
    const stocks = new Array<string>();

    const dateOfFile = new Date(this.parseForDate(file));
    if (theDate.getDate() !== dateOfFile.getDate()) {
      return stocks;
    }
    const nextDate = StockTradeUtil.getEastCoastDate(
      new Date(
        theDate.getDay() < 5
          ? theDate.getTime() + MILLIS_IN_DAY
          : theDate.getTime() + MILLIS_IN_DAY * 3,
      ),
    );
    const time = '<div class="time"';
    const string = '<div class="ticker"';

    curIdx = file.indexOf(string, curIdx);
    while (curIdx > -1) {
      start = file.indexOf(">", curIdx) + 1;
      stop = file.indexOf("</", start);
      const symbol = file.substring(start, stop);
      curIdx = file.indexOf(time, curIdx);
      if (curIdx > stop + 30) {
        curIdx = file.indexOf(string, curIdx);
        continue;
      } else if (curIdx === -1) {
        break;
      }
      start = file.indexOf(">", curIdx) + 1;
      stop = file.indexOf("</", start);
      const timeString = file.substring(start, stop);
      if (timeString.indexOf("AM") > -1 || timeString.indexOf("BMO") > -1) {
        day1Stocks.push(symbol);
      } else if (
        timeString.indexOf("PM") > -1 ||
        timeString.indexOf("AMC") > -1
      ) {
        day2Stocks.push(symbol);
      }
      stocks.push(symbol);
      curIdx = file.indexOf(string, stop);
    }

    await this.insertNewValues(day2Stocks, nextDate);
    return [...day1Stocks, ...day2Stocks];
  }

  /* get list of all the stocks that have earnings the next trading day */
  public static createEarningsLists() {
    this.getEarningsCalendarStocks(1);
    setInterval(() => {
      const currentDate = StockTradeUtil.getEastCoastDate();
      if (currentDate.getDay() < 5) {
        this.getEarningsCalendarStocks(1);
      }
    }, MILLIS_IN_DAY);
  }

  public static testEarningsList() {
    EarningsUtil.parseHTMLFileFromFileName("src/test3.html").then((resp) => {
      console.log(resp);
    });
  }
}
