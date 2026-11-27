import axios from "axios";
import { ICandleData } from "../../types/back-test-types";
import { SchwabDataMap } from "../../types/external-data-types";
import { SchwabAuth } from "./schwab-auth";
import { READ_TIMEOUT_MS } from "../market-data-provider";

export const SCHWAB_MARKET_DATA_URL = "https://api.schwabapi.com/marketdata/v1";

/** Signed-in HTTP calls to Schwab, and the market-data endpoints the app uses. */
export class SchwabClient {
  /** Calls Schwab with the current access token; on a 401, refreshes it and retries once. */
  static async request(
    url: string,
    method: string,
    headers?: object,
    params?: object,
    data?: object,
    retry = true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const token = retry
      ? await SchwabAuth.getAccessToken()
      : await SchwabAuth.forceRefresh();
    try {
      return await axios({
        url,
        method,
        params,
        data,
        headers: { ...headers, Authorization: `Bearer ${token}` },
        // orders get no timeout: one that timed out might still have been placed
        ...(method.toLowerCase() === "get" && { timeout: READ_TIMEOUT_MS }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (retry && err?.response?.status === 401) {
        return this.request(url, method, headers, params, data, false);
      }
      throw err;
    }
  }

  static getPriceHistory(
    symbol: string,
    periodType: string,
    frequencyType: string,
    frequency: number,
    startDate: number,
    endDate: number,
  ): Promise<ICandleData> {
    return this.request(`${SCHWAB_MARKET_DATA_URL}/pricehistory`, "get", undefined, {
      symbol,
      periodType,
      frequencyType,
      frequency,
      startDate,
      endDate,
      needExtendedHoursData: false,
    }).then((resp) => resp.data);
  }

  /** Quotes for comma-separated `symbols`. */
  static getQuotes(symbols: string): Promise<SchwabDataMap> {
    return this.request(`${SCHWAB_MARKET_DATA_URL}/quotes`, "get", undefined, {
      symbols,
      fields: "quote",
      indicative: false,
    }).then((resp) => resp.data);
  }

  static isMarketOpen(): Promise<boolean> {
    return this.request(`${SCHWAB_MARKET_DATA_URL}/markets`, "get", undefined, {
      markets: "equity",
    }).then((resp) => {
      const equity = resp.data.equity;
      if (!equity) return false;
      if (equity.EQ) return equity.EQ.isOpen;
      if (equity.equity) return equity.equity.isOpen;
      return equity.isOpen;
    });
  }
}
