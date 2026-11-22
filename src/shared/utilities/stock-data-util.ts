import { SchwabAPI } from "../services/trading-api";
import { CONSTANTS } from "../constants";
import axios from "axios";
import { DatabaseAPI } from "../services/db-api";
import {
  ICandle,
  ICandleData,
  ISimpleCandle,
} from "../../types/back-test-types";

interface IGraphData {
  candles: ISimpleCandle[];
  postEarningsGain: number;
  symbol: string;
}

const { MILLIS_IN_DAY, BEGIN_TIME, END_TIME } = CONSTANTS;

export class StockDataUtil {
  /* in the UI, you can view stock charts by making a request to the back end to get stock chart data.  this  function gets the
    stock data from TD api, and returns an object (called "graphData" in this function) which will be used in the UI to generate the
    stock graphs */
  public static getCandleData(
    symbolsCommaSeparated: string,
    startTimeString: string,
    endTimeString: string,
    frequencyMinutes = 5,
    useClose = false,
  ) {
    const graphData = new Array<IGraphData>();
    const symbols = symbolsCommaSeparated.split(",");
    const promises = new Array<Promise<ICandleData>>();
    const startTime = parseInt(startTimeString, 10);
    const endTime = parseInt(endTimeString, 10);
    let candles = new Array<ISimpleCandle>();
    let undefinedCount = 0;
    const syms = symbols.slice(0, 120);

    let periodType: string;
    let frequencyType: string;
    let frequency: number;
    if (frequencyMinutes <= 30) {
      periodType = "day";
      frequencyType = "minute";
      frequency = frequencyMinutes;
    } else if (frequencyMinutes <= 1440) {
      periodType = "year";
      frequencyType = "daily";
      frequency = 1;
    } else if (frequencyMinutes <= 20160) {
      periodType = "year";
      frequencyType = "weekly";
      frequency = 1;
    } else {
      periodType = "year";
      frequencyType = "monthly";
      frequency = 1;
    }

    /* getting candle data from TD */
    for (const symbol of syms) {
      promises.push(
        SchwabAPI.getHistoryWithBounds(
          symbol,
          periodType,
          frequencyType,
          frequency,
          startTime,
          endTime,
        ),
      );
    }
    return Promise.all(promises)
      .then((responses) => {
        for (const response of responses) {
          if (!response) {
            undefinedCount++;
          }
        }
        // see how many stocks TD doesn't have candle data for
        if (undefinedCount > 0) {
          console.log("Undefined count: " + undefinedCount);
        }
        for (const response of responses) {
          let dayCount = -1;
          let currentDayKey = "";
          candles = [];
          for (const candle of response.candles) {
            /* the candle.datetime variable received from TD is given in milliseconds.  particularly "milliseconds since epoch",
                    epoch is January 1, 1970 00:00:00 UTC */

            if (candle.datetime >= startTime && candle.datetime <= endTime) {
              const isMinuteCandle = frequencyMinutes <= 30;
              if (!isMinuteCandle || this.inBounds(candle)) {
                const nextDayKey = this.getDayKey(candle.datetime);
                if (nextDayKey !== currentDayKey) {
                  dayCount++;
                  currentDayKey = nextDayKey;
                }

                const time = isMinuteCandle
                  ? this.getTime(candle) - 570 + 390 * dayCount
                  : candles.length;
                const price = this.getPrice(candle, useClose);
                const obj = {
                  price,
                  time,
                  datetime: candle.datetime,
                };
                candles.push(obj);
              }
            }
          }
          graphData.push({
            symbol: response.symbol,
            postEarningsGain: 0,
            candles,
          });
        }
        return graphData;
      })
      .catch((err) => {
        console.log(err);
        throw err;
      });
  }

  private static getDayKey(datetime: number) {
    const date = new Date(datetime);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  public static adjustDayLightSavings(candle: ICandle, comparisonTime: number) {
    let offset = 0;
    if (
      Number.isInteger(
        (candle.datetime - comparisonTime + CONSTANTS.MILLIS_IN_HOUR) /
          MILLIS_IN_DAY,
      )
    ) {
      offset = -1 * CONSTANTS.MILLIS_IN_HOUR;
    } else if (
      Number.isInteger(
        (candle.datetime - comparisonTime - CONSTANTS.MILLIS_IN_HOUR) /
          MILLIS_IN_DAY,
      )
    ) {
      offset = CONSTANTS.MILLIS_IN_HOUR;
    }
    return offset;
  }

  /* made this awhile ago, dont use anymore */
  public static async getCandlesForStock(
    symbolsCommaSeparated: string,
    earningsTime: string,
    timeRange: string,
  ) {
    let end: number;
    let time: number;
    // earnTime is the time that was entered
    const earnTime = parseInt(earningsTime, 10);
    const earningDate = new Date(earnTime);
    const isMonday = earningDate.getDay() === 1;
    let frequency = 1;
    switch (timeRange) {
      case "Pre-earnings":
        time = earnTime - MILLIS_IN_DAY * 7;
        end = earnTime - MILLIS_IN_DAY + 23340000;
        break;
      case "Post-earnings":
        time = !isMonday
          ? earnTime - MILLIS_IN_DAY
          : earnTime - MILLIS_IN_DAY * 3 + 23340000;
        end = isMonday
          ? earnTime + MILLIS_IN_DAY * 4 + 23340000
          : earnTime + MILLIS_IN_DAY * 6 + 23340000;
        break;
      case "Post-earnings-long":
        time = !isMonday
          ? earnTime - MILLIS_IN_DAY
          : earnTime - MILLIS_IN_DAY * 3 + 23340000;
        end = isMonday
          ? earnTime + MILLIS_IN_DAY * 11 + 23340000
          : earnTime + MILLIS_IN_DAY * 13 + 23340000;
        break;
      case "Earnings":
        time = !isMonday
          ? earnTime - MILLIS_IN_DAY
          : earnTime - MILLIS_IN_DAY * 3 + 23340000;
        end = earnTime + 23340000;
        frequency = 1;
        break;
      default:
        throw new Error(`Invalid timeRange: ${timeRange}`);
    }
    const graphData = new Array<IGraphData>();
    const symbols = symbolsCommaSeparated.split(",");
    const promises = new Array<Promise<ICandleData>>();
    for (const symbol of symbols) {
      promises.push(
        SchwabAPI.getHistoryWithBounds(
          symbol,
          "day",
          "minute",
          frequency,
          time,
          end,
        ),
      );
    }
    return Promise.all(promises)
      .then((responses) => {
        for (const response of responses) {
          console.log("-----------------------------");
          console.log(response.symbol);
          const postEarningsGain = 0;
          if (response.empty) {
            continue;
          }
          graphData.push({
            symbol: response.symbol,
            postEarningsGain,
            candles: response.candles.map((candle) => ({
              price: this.getPrice(candle),
              time: candle.datetime,
              datetime: candle.datetime,
            })),
          });
        }
        return graphData;
      })
      .catch((err) => {
        console.log(err);
        return err;
      });
  }

  public static getPostEarningsGains(symbols: string, earningsTime: string) {
    const stocks = symbols.split(",");
    const earnTime = parseInt(earningsTime, 10);
    const day = new Date(earnTime).getDay();
    const prevDay =
      day === 1 ? earnTime - MILLIS_IN_DAY * 3 : earnTime - MILLIS_IN_DAY;
    const promises = new Array<Promise<ICandleData>>();
    const gains = new Array<number>();
    for (const stock of stocks) {
      promises.push(
        SchwabAPI.getHistoryWithBounds(
          stock,
          "month",
          "daily",
          1,
          prevDay,
          earnTime,
        ),
      );
    }
    return Promise.all(promises)
      .then((responses) => {
        for (const response of responses) {
          if (response.empty) {
            continue;
          }
          const candles = response.candles;
          const postEarningsGain = candles[1].open / candles[0].close;
          gains.push(postEarningsGain);
          console.log(
            "symbol: " + response.symbol + ", gain: " + postEarningsGain,
          );
          console.log(
            "gain during the day: " + candles[1].close / candles[1].open,
          );
        }
      })
      .catch((error) => {
        return error;
      });
  }

  private static getPrice(candle: ICandle, useClose = false) {
    return useClose ? candle.close : candle.open;
  }

  public static getTime(candle: ICandle) {
    const date = new Date(candle.datetime);
    return date.getHours() * CONSTANTS.MINS_IN_HOUR + date.getMinutes();
  }

  public static inBounds(candle: ICandle) {
    const date = new Date(candle.datetime);
    return (
      date.getDay() <= 5 &&
      date.getHours() * CONSTANTS.MINS_IN_HOUR + date.getMinutes() >=
        BEGIN_TIME &&
      date.getHours() * CONSTANTS.MINS_IN_HOUR + date.getMinutes() < END_TIME
    );
  }
  public static parseForDate(file: string) {
    const beginString = "Earnings Calendar for ";
    const dateBeginIdx = file.indexOf(beginString) + beginString.length;
    const dateEndIdx = file.indexOf("</title>", dateBeginIdx);
    const date = file.substring(dateBeginIdx, dateEndIdx).trim();
    return date;
  }

  /* pass in any url, and the start and end substrings to parse between in order to get the stock symbols.
    for example, used in appRouter:
    await StockDataUtil.parseString('https://www.slickcharts.com/sp500', '/symbol/', '\"', 's&p500');
    await StockDataUtil.parseString('https://www.iposcoop.com/last-12-months/', 'http://finance.yahoo.com/q?s=', '\"', 'ipo stocks');
    in the html, i look for the '/symbol' substring on each line.  and then i get everything after that until the next " string.  that
    is the stock name.  so it might be like: /symbol/AAPL"somethings
    then i store the stock symbols in the database
    */
  public static async parseString(
    url: string,
    startString: string,
    endString: string,
    propName: string,
    store = false,
  ) {
    return axios.get(url).then((resp) => {
      const string = resp.data;
      let curIdx = 0;
      const arr = new Array<string>();
      const strLength = startString.length;
      let end: number;
      curIdx = string.indexOf(startString, curIdx);
      while (curIdx > 0 && curIdx < string.length) {
        end = string.indexOf(endString, curIdx);
        const symbol = string.substring(curIdx + strLength, end);
        if (symbol === arr[arr.length - 1]) {
          curIdx = string.indexOf(startString, curIdx + 1);
          continue;
        }
        arr.push(string.substring(curIdx + strLength, end));
        curIdx = string.indexOf(startString, curIdx + 1);
      }
      console.log(arr.length);
      const str =
        "insert into properties (name, value) values (" +
        "'" +
        propName +
        "'" +
        ", '" +
        arr.join(",") +
        "')";
      if (store) {
        DatabaseAPI.runQuery(str).then(() => arr);
      } else {
        return arr;
      }
    });
  }

  /* parse from html file downloaded from earningswhispers URL, and get the stock symbols */
  public static parseHTMLFile(file: string): string[] {
    let curIdx = 0;
    let start: number;
    let stop: number;
    const day1Stocks = new Array<string>();
    const day2Stocks = new Array<string>();
    const timeNow = new Date(Date.now());
    const theDate =
      timeNow.getDay() < 5
        ? new Date(Date.now() + MILLIS_IN_DAY)
        : new Date(Date.now() + MILLIS_IN_DAY * 3);
    const stocks = new Array<string>();

    const dateOfFile = new Date(this.parseForDate(file));
    if (theDate.getDate() !== dateOfFile.getDate()) {
      return stocks;
    }
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
    return stocks;
  }
}
