import axios from "axios";
import {
  ICandleData,
  IPolygonCandle,
  IPolygonCandleResponse,
  IRange,
} from "../../types/back-test-types";
import {
  IOptionsChain,
  IOrder,
  IPosition,
  SchwabData,
  SchwabDataMap,
  YahooData,
} from "../../types/external-data-types";
import { DatabaseAPI } from "./db-api";
import { MILLIS_IN_DAY } from "../constants";
import { AccountType } from "../enums";
import * as dotenv from "dotenv";

let token = "";
let refreshTime = 0;
let regularAccountNumber = "";
let tradingAccountNumber = "";
let yahooKey = "";

const TIMEOUT = 30000;

const GET = "get";
const POST = "post";
const PUT = "put";
const DELETE = "delete";

dotenv.config();

interface IDateRange {
  start: number;
  end: number;
}

interface IDateRangeString {
  start: string;
  end: string;
}

const SCHWAB_MARKET_DATA_URL = "https://api.schwabapi.com/marketdata/v1";

const SCHWAB_TRADER_URL = "https://api.schwabapi.com/trader/v1";

const YAHOO_URL = "https://apidojo-yahoo-finance-v1.p.rapidapi.com";

const getYahooHeaders = () => {
  return {
    headers: {
      "x-rapidapi-host": "apidojo-yahoo-finance-v1.p.rapidapi.com",
      "x-rapidapi-key": yahooKey,
    },
  };
};

const getAccountNumber = (type: AccountType) => {
  return type === AccountType.TRADING
    ? tradingAccountNumber
    : regularAccountNumber;
};

const normalizeSchwabDateTime = (
  value: string | number | undefined,
  fieldName: "startDate" | "endDate",
): string => {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required Schwab transaction ${fieldName}`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid date value for Schwab transaction ${fieldName}: ${String(value)}`,
    );
  }
  return parsed.toISOString();
};

dotenv.config();
const {
  AWS_URL,
  REGULAR_ACCOUNT_HASH,
  TRADING_ACCOUNT_HASH,
  YAHOO_KEY,
  POLYGON_KEY,
} = process.env;

if (REGULAR_ACCOUNT_HASH) {
  regularAccountNumber = REGULAR_ACCOUNT_HASH;
}
if (TRADING_ACCOUNT_HASH) {
  tradingAccountNumber = TRADING_ACCOUNT_HASH;
}
if (YAHOO_KEY) {
  yahooKey = YAHOO_KEY;
}

export class SchwabAPI {
  static makeAxiosCall(
    url: string,
    method: string,
    headers?: object,
    params?: object,
    data?: object,
  ) {
    return axios({ url, method, params, data, headers: { ...headers } }).catch(
      (err) => {
        if (err?.response?.status === 401) {
          return this.resetAccessToken().then(() =>
            axios({ url, method, params, data, headers: { ...headers } }),
          );
        }
        throw err;
      },
    );
  }

  static async getStockHistoryPolygon(
    symbol: string,
    timespan: string,
    multiplier: string,
    timeRange: IDateRange | IDateRangeString,
  ) {
    const initialUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${timeRange.start}/${timeRange.end}`;
    let url = initialUrl;
    const params = {
      results: 50000,
      adjusted: true,
      sort: "asc",
      apiKey: POLYGON_KEY,
    };
    let allCandles: IPolygonCandle[] = [];
    let retVal: IPolygonCandleResponse = {
      results: [],
      ticker: symbol,
      queryCount: 0,
      resultsCount: 0,
      adjusted: true,
    };
    while (url) {
      const res = await this.makeAxiosCall(url, GET, {}, params);
      const data = await res.data;

      if (data.results) {
        allCandles = allCandles.concat(data.results);
        retVal = { ...data, results: allCandles };
      }

      // Polygon returns next_url if more data is available
      url = data.next_url || null;
    }
    return retVal;
  }

  static async callSchwabApi(
    url: string,
    method: string,
    headers?: object,
    params?: object,
    data?: object,
    retry = true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    try {
      return await axios({
        url,
        method,
        params,
        data,
        headers: { ...headers, Authorization: token },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (retry && err?.response?.status === 401) {
        await this.resetAccessToken();
        return this.callSchwabApi(url, method, headers, params, data, false);
      }
      throw err;
    }
  }

  public static getRefreshTime() {
    return refreshTime;
  }

  public static initialize() {
    return this.resetAccessToken()
      .then(() => this.testAccessToken())
      .catch((err) => {
        if (err?.response?.status === 401) {
          return this.resetAccessToken();
        } else {
          console.log(err);
        }
      });
  }

  public static computePayloadOption(
    symbol: string,
    price: number,
    instruction: string,
    quantity: number,
    orderType = "LIMIT",
  ) {
    const payload = {
      complexOrderStrategyType: "NONE",
      orderType: "LIMIT",
      session: "NORMAL",
      price: orderType === "LIMIT" ? "6.45" : undefined,
      duration: "DAY",
      orderStrategyType: "SINGLE",
      orderLegCollection: [
        {
          instruction: "BUY_TO_OPEN",
          quantity: 10,
          instrument: {
            symbol: "FB_011924C330",
            assetType: "OPTION",
          },
        },
      ],
    };

    payload.orderType = orderType;
    if (price) {
      payload.price = orderType === "LIMIT" ? "" + price : undefined;
    }
    payload.orderLegCollection[0].quantity = quantity;
    payload.orderLegCollection[0].instrument.symbol = symbol;
    if (instruction === "BUY") {
      payload.orderLegCollection[0].instruction = "BUY_TO_OPEN";
    } else if (instruction === "SELL") {
      payload.orderLegCollection[0].instruction = "SELL_TO_CLOSE";
    } else {
      payload.orderLegCollection[0].instruction = instruction;
    }
    return payload;
  }

  public static computePayload(
    symbol: string,
    price: number,
    instruction: string,
    quantity: number,
    orderType = "LIMIT",
  ) {
    const payload = {
      orderType: "LIMIT",
      session: "NORMAL",
      duration: "DAY",
      orderStrategyType: "SINGLE",
      price: "",
      orderLegCollection: [
        {
          instruction: "Buy",
          quantity: 1,
          instrument: {
            symbol: "FB",
            assetType: "EQUITY",
          },
        },
      ],
    };
    payload.orderType = orderType;
    if (orderType === 'LIMIT') {
      payload.price = "" + price;
    }

    payload.orderLegCollection[0].quantity = quantity;
    payload.orderLegCollection[0].instrument.symbol = symbol;
    payload.orderLegCollection[0].instruction = instruction;
    return payload;
  }

  public static reCheckAccessToken() {
    return DatabaseAPI.runQuery<{ value: string }>(
      "select value from properties where name='access_token'",
    ).then((rows) => {
      token = rows[0].value;
      return rows[0].value;
    });
  }

  public static testAccessToken() {
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/AAPL/quotes`,
      GET,
      undefined,
      undefined,
      undefined,
    );
  }

  public static buyStock(
    symbol: string,
    price: number,
    quantity: number,
    limit = true,
    accountType: AccountType = AccountType.TRADING,
  ): Promise<string> {
    const accountNumber = getAccountNumber(accountType);
    const payload = this.computePayload(
      symbol,
      price,
      "BUY",
      quantity,
      limit ? "LIMIT" : "MARKET",
    );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    ).then((resp) =>
      resp.headers?.location?.substring(
        resp.headers.location.lastIndexOf("/") + 1,
      ),
    );
  }

  public static shortStock(
    symbol: string,
    price: number,
    quantity: number,
    limit = true,
    accountType: AccountType = AccountType.TRADING,
  ): Promise<string> {
    const accountNumber = getAccountNumber(accountType);
    const payload = this.computePayload(
      symbol,
      price,
      "SELL_SHORT",
      quantity,
      limit ? "LIMIT" : "MARKET",
    );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    ).then((resp) =>
      resp.headers?.location?.substring(
        resp.headers.location.lastIndexOf("/") + 1,
      ),
    );
  }

  public static sellStock(
    symbol: string,
    price: number,
    quantity: number,
    limit = true,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    const payload = this.computePayload(
      symbol,
      price,
      "SELL",
      quantity,
      limit ? "LIMIT" : "MARKET",
    );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    ).then((resp) =>
      resp.headers?.location?.substring(
        resp.headers.location.lastIndexOf("/") + 1,
      ),
    );
  }

  public static buyToCoverStock(
    symbol: string,
    price: number,
    quantity: number,
    limit = true,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    const payload = this.computePayload(
      symbol,
      price,
      "BUY_TO_COVER",
      quantity,
      limit ? "LIMIT" : "MARKET",
    );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    ).then((resp) =>
      resp.headers?.location?.substring(
        resp.headers.location.lastIndexOf("/") + 1,
      ),
    );
  }

  public static getOrder(
    orderId: string,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders/${orderId}`,
      GET,
    ).then((resp) => resp.data);
  }

  public static cancelOrder(
    orderId: string,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders/${orderId}`,
      DELETE,
      undefined,
      undefined,
      undefined,
    ).then((resp) => resp.data);
  }

  public static replaceOrder(
    orderId: string,
    symbol: string,
    price: number,
    orderType: string,
    quantity: number,
    accountType: AccountType = AccountType.TRADING
  ) {
    const accountNumber = getAccountNumber(accountType);
    const payload = this.computePayload(symbol, price, orderType, quantity);
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders/${orderId}`,
      PUT,
      undefined,
      undefined,
      payload,
    ).then((resp) => resp.headers.location);
  }
  public static getAccountPositions(
    accountType: AccountType = AccountType.TRADING,
  ): Promise<IPosition[]> {
    const accountNumber = getAccountNumber(accountType);
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}`,
      GET,
      undefined,
      { fields: "positions" },
    ).then((resp) => {
      return resp.data.securitiesAccount.positions;
    });
  }

  public static getBuyingPower(accountType: AccountType = AccountType.TRADING) {
    const accountNumber = getAccountNumber(accountType);

    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}`,
      GET,
      undefined,
      { fields: "positions" },
    ).then((resp) => resp.data.securitiesAccount.currentBalances.cashBalance);
  }

  public static resetAccessToken() {
    // if the token was just refreshed, then no need to refresh again
    if (Math.round((refreshTime - Date.now()) / 60000) === 30) {
      return Promise.resolve();
    }
    return axios
      .get(`${AWS_URL}/get-token`, { timeout: TIMEOUT })
      .then((resp) => {
        token = "Bearer " + resp.data.token;
        refreshTime = resp.data.refreshTime;
        //return DatabaseAPI.runQuery('update properties set value=\'' + token + '\' where name=\'access_token\'', true);
      })
      .catch((err) => {
        throw err;
      });
  }

  public static getTrades(range: IRange, accountType: AccountType = AccountType.TRADING) {
    const accountNumber = getAccountNumber(accountType);
    const params = {
      types: "TRADE",
      startDate: normalizeSchwabDateTime(range.start, "startDate"),
      endDate: normalizeSchwabDateTime(range.end, "endDate"),
    };
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/transactions`,
      GET,
      undefined,
      params,
      undefined,
    ).then((resp) => resp.data);
  }

  public static getPendingOrders(
    range?: IRange,
    accountType: AccountType = AccountType.TRADING,
  ) {
    return this.getOrders("WORKING", range, accountType);
  }

  public static getOrders(
    status?: string,
    range?: IRange,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    const rangeIsoStrings = { start: "", end: "" };
    if (range) {
      if (range.start) {
        rangeIsoStrings.start = new Date(range.start).toISOString();
      }
      if (range.end) {
        rangeIsoStrings.end = new Date(range.end).toISOString();
      }
    }
    const query = {
      status,
      fromEnteredTime:
        rangeIsoStrings?.start ??
        new Date(Date.now() - MILLIS_IN_DAY).toISOString(),
      toEnteredTime: rangeIsoStrings?.end ?? new Date().toISOString(),
    };

    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      GET,
      undefined,
      query,
      undefined,
    ).then((resp) => resp.data);
  }

  public static placeOrder(
    order: IOrder,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);

    const payload = order.option
      ? this.computePayloadOption(
          order.symbol,
          order.price,
          order.orderType,
          order.shares,
          order.marketOrder ? "MARKET" : "LIMIT",
        )
      : this.computePayload(
          order.symbol,
          order.price,
          order.orderType,
          order.shares,
          order.marketOrder ? "MARKET" : "LIMIT",
        );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    ).then((resp) =>
      resp.headers?.location?.substring(
        resp.headers.location.lastIndexOf("/") + 1,
      ),
    );
  }

  public static placeOptionsTrade(
    symbol: string,
    price: number,
    instruction: string,
    quantity: number,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);

    const payload = this.computePayloadOption(
      symbol,
      price,
      instruction,
      quantity,
    );
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/orders`,
      POST,
      undefined,
      undefined,
      payload,
    );
  }

  public static getTransactionHistory(
    symbol: string,
    startDate: string,
    endDate: string,
    accountType: AccountType = AccountType.TRADING,
  ) {
    const accountNumber = getAccountNumber(accountType);
    const params = {
      startDate: normalizeSchwabDateTime(startDate, "startDate"),
      endDate: normalizeSchwabDateTime(endDate, "endDate"),
      symbol,
      types: "TRADE",
    };
    return this.callSchwabApi(
      `${SCHWAB_TRADER_URL}/accounts/${accountNumber}/transactions`,
      GET,
      undefined,
      params,
      undefined,
    ).then((resp) => resp.data);
  }

  public static getStockData(stockName: string): Promise<SchwabData> {
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/${stockName}/quotes`,
      GET,
      undefined,
      undefined,
      undefined,
    ).then((resp) => resp.data[stockName]);
  }

  public static getStockDataMultiple(
    stockNames: string,
  ): Promise<SchwabDataMap> {
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/quotes`,
      GET,
      undefined,
      { symbols: stockNames, fields: "quote", indicative: false },
      undefined,
    ).then((resp) => resp.data);
  }

  public static getStocks(symbols: string[]): Promise<YahooData[]> {
    const headers = getYahooHeaders();
    return axios
      .get(`${YAHOO_URL}/market/v2/get-quotes?region=US&symbols=${symbols}`, {
        ...headers,
        timeout: TIMEOUT,
      })
      .then((resp) => {
        if (resp.data && resp.data.quoteResponse) {
          return resp.data.quoteResponse.result;
        } else {
          return resp.data; // resp.data is empty string ''
        }
      });
  }

  public static getStock(symbol: string) {
    return this.getStockData(symbol);
  }

  public static getHistoryForStock(
    symbol: string,
    periodType: string,
    period: number,
    frequencyType: string,
    frequency: number,
  ): Promise<ICandleData> {
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/pricehistory`,
      GET,
      undefined,
      {
        symbol,
        periodType,
        period,
        frequencyType,
        frequency,
        needExtendedHoursData: false,
      },
      undefined,
    ).then((resp) => resp.data);
  }

  public static getHistoryWithBounds(
    symbol: string,
    periodType: string,
    frequencyType: string,
    frequency: number,
    startDate: number,
    endDate: number,
  ): Promise<ICandleData> {
    const params = {
      symbol,
      periodType,
      frequencyType,
      frequency,
      startDate,
      endDate,
      needExtendedHoursData: false,
    };
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/pricehistory`,
      GET,
      undefined,
      params,
      undefined,
    ).then((resp) => resp.data);
  }

  public static isMarketOpen() {
    const params = { markets: "equity" };
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/markets`,
      GET,
      undefined,
      params,
      undefined,
    ).then((resp) => {
      const equity = resp.data.equity;
      if (equity) {
        if (equity.EQ) {
          return equity.EQ.isOpen;
        } else if (equity.equity) {
          return equity.equity.isOpen;
        } else {
          return equity.isOpen;
        }
      } else {
        return false;
      }
    });
  }

  public static getOptionsChains(
    symbol: string,
    strikes: number,
    contractType?: string,
  ): Promise<IOptionsChain> {
    const params = {
      symbol,
      strikeCount: strikes,
      optionType: "S",
      contractType: contractType ? contractType : "ALL",
    };
    return this.callSchwabApi(
      `${SCHWAB_MARKET_DATA_URL}/chains`,
      GET,
      undefined,
      params,
      undefined,
    ).then((resp) => resp.data);
  }
}
