import axios from "axios";
import { READ_TIMEOUT_MS } from "../market-data-provider";
import { IPolygonCandle, IPolygonCandleResponse } from "../../types/back-test-types";

/** Massive (formerly Polygon.io). The key is sent as the `apiKey` query parameter. */
const baseUrl = () => process.env.MASSIVE_API_URL || "https://api.massive.com";
const apiKey = () => process.env.MASSIVE_API_KEY || process.env.POLYGON_KEY;

/** One ticker from the snapshot endpoint (only the fields the app reads). */
export interface IMassiveSnapshot {
  ticker: string;
  day?: { c?: number; v?: number };
  min?: { c?: number; av?: number };
  lastTrade?: { p?: number };
}

const get = async <T>(url: string, params: object = {}): Promise<T> => {
  const key = apiKey();
  if (!key) {
    throw new Error("MASSIVE_API_KEY is not set in .env (the Massive data provider needs it).");
  }
  const res = await axios.get(url, { params: { ...params, apiKey: key }, timeout: READ_TIMEOUT_MS });
  return res.data;
};

export class MassiveClient {
  /** Aggregate bars, following `next_url` until every page is read. */
  static async getAggregates(
    symbol: string,
    timespan: string,
    multiplier: string,
    timeRange: { start: number | string; end: number | string },
  ): Promise<IPolygonCandleResponse> {
    let url: string | null =
      `${baseUrl()}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${timeRange.start}/${timeRange.end}`;
    let params: object = { limit: 50000, adjusted: true, sort: "asc" };
    let results: IPolygonCandle[] = [];
    let response: IPolygonCandleResponse = {
      results: [],
      ticker: symbol,
      queryCount: 0,
      resultsCount: 0,
      adjusted: true,
    };
    while (url) {
      const data: IPolygonCandleResponse & { next_url?: string } = await get(url, params);
      if (data.results) {
        results = results.concat(data.results);
        response = { ...data, ticker: symbol, results };
      }
      // next_url already carries the query, except the key
      url = data.next_url || null;
      params = {};
    }
    return response;
  }

  /** Snapshots for up to a few hundred tickers per call. */
  static async getSnapshots(tickers: string[]): Promise<IMassiveSnapshot[]> {
    const data = await get<{ tickers?: IMassiveSnapshot[] }>(
      `${baseUrl()}/v2/snapshot/locale/us/markets/stocks/tickers`,
      { tickers: tickers.join(",") },
    );
    return data.tickers ?? [];
  }

  /** "open", "closed" or "extended-hours". */
  static async getMarketStatus(): Promise<string> {
    const data = await get<{ market?: string }>(`${baseUrl()}/v1/marketstatus/now`);
    return data.market ?? "closed";
  }
}
