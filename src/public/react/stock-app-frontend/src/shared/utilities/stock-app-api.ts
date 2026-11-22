import axios, { AxiosResponse } from "axios";
import {
  IFilter,
  IOrder,
  IStrategy,
  IUser,
  IUserToken,
  IVariableDefinition,
} from "../types";
import { OptionStrikePrice } from "../enums";
import { IPosition } from "../trading-types";
import { Nullable } from "primereact/ts-helpers";

interface IOptionParams {
  symbol: string;
  quantity: number;
  marketOrder: boolean;
  limitPrice?: number;
  contractSymbol?: string;
  weeklies?: OptionStrikePrice[];
  shortTerm?: OptionStrikePrice[];
  midTerm?: OptionStrikePrice[];
  longTerm?: OptionStrikePrice[];
  leaps?: OptionStrikePrice[];
  optionLength?: "weeklies" | "shortTerm" | "midTerm" | "longTerm" | "leaps";
  optionAggressiveness?: OptionStrikePrice;
}

export interface IQuoteResponse {
  symbol: string;
  description?: string;
  bid: number | null;
  ask: number | null;
  mark: number | null;
  last: number | null;
  quoteTime: number;
}

export interface IBatchQuoteResponseItem {
  requestedSymbol: string;
  symbol: string;
  description: string | null;
  lastPrice: number | null;
}

export interface IBatchQuoteResponse {
  [symbol: string]: IBatchQuoteResponseItem;
}

export interface IOptionPreviewResponse {
  symbol: string;
  selection: {
    timeFrame: string;
    strikeType: string;
  };
  contractSymbol: string;
  strikePrice: number;
  expirationDate: string;
  bid: number;
  ask: number;
  midpoint: number;
  contractPrice: number;
  estimatedQuantity: number;
  estimatedTotal: number;
}

export interface IOptionChainContractResponse {
  symbol: string;
  strikePrice: number;
  bid: number;
  ask: number;
  mark: number;
}

export interface IOptionChainExpirationResponse {
  expirationDate: string;
  daysToExpiration: number;
  calls: IOptionChainContractResponse[];
  puts: IOptionChainContractResponse[];
}

export interface IOptionChainResponse {
  symbol: string;
  underlyingPrice: number;
  expirations: IOptionChainExpirationResponse[];
}
export class StockAppAPI {
  public static runBackTests(
    strategyIds: number[],
    startDate: number | undefined,
    endDate: number | undefined,
    groupId: number,
    stored: boolean,
  ) {
    const str = strategyIds.reduce(
      (prev, cur, idx) =>
        idx === 0 ? prev + cur : prev + "&strategyId=" + cur,
      "?strategyId=",
    );
    return this.request(
      `api/run/back-test${str}&startTime=${startDate}&endTime=${endDate}&groupId=${groupId}&stored=${stored}`,
      "patch",
    );
  }

  public static getBacktestResults(groupId: number, strategyIds?: number[]) {
    const strategyQuery = strategyIds?.length
      ? strategyIds.map((id) => `&strategyId=${id}`).join("")
      : "";
    return this.request(
      `api/run/back-test-results?groupId=${groupId}${strategyQuery}`,
      "get",
    );
  }

  public static logout(): Promise<AxiosResponse> {
    return this.request(`api/logout`, "delete");
  }

  public static register(credentials: IUser): Promise<AxiosResponse> {
    return this.request(
      `user/register`,
      "post",
      credentials,
    );
  }
  public static login(username: string, password: string): Promise<IUserToken> {
    return this.request(`/user/login`, "post", {
      username,
      password,
    });
  }

  public static getAccountPositions(
    accountType: string,
  ): Promise<{ positions: IPosition[] }> {
    return this.request(
      `api/trade/acct-positions?accountType=${accountType}`,
      "get",
    );
  }

  public static makeOrders(orders: IOrder[], accountType: string) {
    return this.request(
      `api/trade/make-orders?accountType=${accountType}`,
      "post",
      { orders },
    );
  }

  public static getStockNames(groupName: string) {
    return this.request(
      `api/group/names?group=${groupName}`,
      "get",
    );
  }

  public static storeHistory(obj: unknown) {
    return this.request(
      `api/util/stock-history`,
      "post",
      obj,
    );
  }

  public static createStrategy(strat: IStrategy) {
    return this.request(`api/strategy`, "post", strat);
  }

  public static makeOptionsTrades(params: IOptionParams, accountType?: string) {
    const accountQuery = accountType ? `?accountType=${encodeURIComponent(accountType)}` : "";
    return this.request(
      `api/trade/options-trade${accountQuery}`,
      "post",
      params,
    );
  }

  public static previewOptionTrade(params: {
    symbol: string;
    quantity: number;
    optionLength: "weeklies" | "shortTerm" | "midTerm" | "longTerm" | "leaps";
    optionAggressiveness: OptionStrikePrice;
  }): Promise<IOptionPreviewResponse> {
    return this.request(
      `api/trade/options-preview`,
      "post",
      params,
    );
  }

  public static getQuote(symbol: string): Promise<IQuoteResponse> {
    return this.request(
      `api/trade/quote?symbol=${encodeURIComponent(symbol)}`,
      "get",
    );
  }

  public static getOptionsChain(symbol: string): Promise<IOptionChainResponse> {
    return this.request(
      `api/trade/options-chain?symbol=${encodeURIComponent(symbol)}`,
      "get",
    );
  }

  public static retrieveTransactions(
    symbol: string,
    startDate: string,
    endDate: string,
    accountType?: string,
  ) {
    const accountQuery = accountType ? `&accountType=${encodeURIComponent(accountType)}` : "";
    return this.request(
      `api/trade/transactions?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}${accountQuery}`,
      "get",
    );
  }

  /* not sure whether I should make getData a post request */
  public static getData(
    scenarioFilters: IFilter[],
    dataFilters: IFilter[],
    period: number,
    startDate: Nullable<Date>,
    endDate: Nullable<Date>,
    groupId: number,
  ) {
    return this.request(
      `api/analysis/get-data`,
      "post",
      {
        scenarioFilters,
        dataFilters,
        period,
        startTime: startDate?.getTime(),
        endTime: endDate?.getTime(),
        groupId,
      },
    );
  }

  public static checkVariables(
    variables: IVariableDefinition[],
    groupId: number,
    startDate?: Nullable<Date>,
    endDate?: Nullable<Date>,
  ) {
    return this.request(
      `api/analysis/check-variables`,
      "post",
      {
        variables,
        groupId,
        startTime: startDate?.getTime(),
        endTime: endDate?.getTime(),
      },
    );
  }

  public static getSimulationsTransactions(
    simulations: number[],
    pingTime: number,
  ) {
    let str = "runId=";
    for (let i = 0; i < simulations.length; i++) {
      if (i < simulations.length - 1) {
        str += simulations[i] + "&runId=";
      } else {
        str += simulations[i];
      }
    }
    return this.request(
      `api/transaction/simulation?${str}&pingTime=${pingTime}`,
      "get",
    );
  }

  public static getSimulationTransactions(runId: number, pingTime: number) {
    return this.request(
      `api/transaction/simulation?runId=${runId}&pingTime=${pingTime}`,
      "get",
    );
  }

  public static getRealStrategiesTransactions(
    runIds: number[],
    pingTime: number,
  ) {
    let str = "runId=";
    for (let i = 0; i < runIds.length; i++) {
      if (i < runIds.length - 1) {
        str += runIds[i] + "&runId=";
      } else {
        str += runIds[i];
      }
    }
    return this.request(
      `api/transaction/real?${str}&pingTime=${pingTime}`,
      "get",
    );
  }

  public static runRealStrategy(stratId: number, groupId: number) {
    return this.request(
      `api/run/real-strategy?strategyId=${stratId}&groupId=${groupId}`,
      "patch",
    );
  }

  public static runSimulation(simId: number, groupId: number) {
    return this.request(
      `api/run/simulation?strategyId=${simId}&groupId=${groupId}&test=true`,
      "patch",
    );
  }

  public static runSimulations(
    stratIds: number[],
    groupId: number,
    notify = false,
  ) {
    let str;
    if (stratIds.length > 1) {
      str = stratIds.reduce(
        (prev, cur, idx) =>
          idx === 0 ? prev + cur + "&strategyId=" : prev + "&strategyId=" + cur,
        "?strategyId=",
      );
    } else {
      str = "?strategyId=" + stratIds[0];
    }
    return this.request(
      `api/run/simulation${str}&groupId=${groupId}${notify ? "&notify=true" : ""}`,
      "patch",
    );
  }

  public static getCurrentRunningSimulations() {
    return this.request(
      `api/run/current-simulations`,
      "get",
    );
  }

  public static getCurrentRealStrategies() {
    return this.request(
      `api/run/current-strategies`,
      "get",
    );
  }

  public static getAllStrategyNames() {
    return this.request(`api/strategy/names`, "get");
  }

  public static getStrategy(name: string) {
    return this.request(
      `api/strategy/getByName?name=${name}`,
      "get",
    ).then((data) => data.strategy);
  }

  public static saveStrategy(strategy: IStrategy) {
    return this.request(
      `api/strategy/${strategy.id}`,
      "put",
      strategy,
    );
  }

  public static pauseSimulation(id: number) {
    return this.request(
      `api/run/pause-simulation`,
      "patch",
      { id },
    );
  }

  public static resumeSimulation(id: number) {
    return this.request(
      `api/run/resume-simulation`,
      "patch",
      { id },
    );
  }

  public static pauseRealStrategy(id: number) {
    return this.request(
      `api/run/pause-real-strategy`,
      "patch",
      { id },
    );
  }

  public static resumeRealStrategy(id: number) {
    return this.request(
      `api/run/resume-real-strategy`,
      "patch",
      { id },
    );
  }

  public static endSimulation(id: number) {
    return this.request(
      `api/run/end-simulation`,
      "patch",
      { id },
    );
  }

  public static endRealStrategy(id: number) {
    return this.request(
      `api/run/end-real-strategy`,
      "patch",
      { id },
    );
  }

  public static getAllStrategies() {
    return this.request(
      `api/strategy/all`,
      "get",
    ).then((data) => data.strategies);
  }

  public static deleteStrategy(id: number) {
    return this.request(
      `api/strategy/${id}`,
      "delete",
    );
  }

  public static deleteStrategies(ids: number[]) {
    const str = ids.reduce(
      (prev, cur, idx) => (idx === 0 ? prev + cur : prev + "&id=" + cur),
      "?id=",
    );
    return this.request(
      `api/strategy${str}`,
      "delete",
    );
  }

  public static getAllStockGroupNames() {
    return this.request(`api/group/names`, "get");
  }

  public static getAllStockGroups() {
    return this.request(`api/group/all`, "get");
  }

  public static createStockGroup(name: string, symbols: string[]) {
    return this.request(`api/group`, "post", {
      name,
      symbols,
    });
  }

  public static saveStockGroup(name: string, symbols: string[], id: number) {
    return this.request(`api/group/${id}`, "put", {
      name,
      symbols,
      id,
    });
  }

  public static deleteGroup(id: number) {
    return this.request(`api/group/${id}`, "delete");
  }

  public static deleteGroups(ids: number[]) {
    const str = ids.reduce(
      (prev, cur, idx) => (idx === 0 ? prev + cur : prev + "&id=" + cur),
      "?id=",
    );
    return this.request(`api/group${str}`, "delete");
  }

  public static getSimulationRuns(sims: number[]) {
    const str = sims.reduce(
      (prev, cur, idx) => (idx === 0 ? prev + cur : prev + "&id=" + cur),
      "?id=",
    );
    return this.request(
      `api/run/get-runs${str}`,
      "get",
    );
  }

  public static getStockPrices(stockNames: string[]) {
    const params = new URLSearchParams();
    for (const symbol of stockNames) {
      params.append("symbols", symbol);
    }

    return this.request(
      `api/util/quotes?${params.toString()}`,
      "get",
    ) as Promise<IBatchQuoteResponse>;
  }

  public static getPendingOrders(range?: { start: string; end: string }) {
    return this.request(
      `api/pending-orders?start=${range?.start}&end=${range?.end}`,
      "get",
    );
  }

  public static getCandleData(
    symbols: string[] | undefined,
    startTime: number,
    endTime: number,
    frequencyMinutes: number,
    useClose: boolean,
    groupId?: number,
  ) {
    const params = new URLSearchParams();
    if (symbols?.length) {
      for (const symbol of symbols) {
        params.append("symbols", symbol);
      }
    }
    if (groupId) {
      params.append("groupId", String(groupId));
    }
    params.append("startTime", String(startTime));
    params.append("endTime", String(endTime));
    params.append("frequencyMinutes", String(frequencyMinutes));
    params.append("useClose", String(useClose));

    return this.request(
      `api/candle-data?${params.toString()}`,
      "get",
    );
  }

  private static request(url: string, method: string, data?: unknown) {
    const str = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
      "x-access-token": "",
    };
    if (str) {
      headers["x-access-token"] = JSON.parse(str).token;
    }
    const methods = ["get", "post", "delete", "patch", "put"];
    if (methods.indexOf(method) === -1) {
      throw Error("Invalid method type");
    }
    return axios({ method: method, url, data, headers })
      .then((resp) => {
        return resp.data;
      })
      .catch((err) => {
        if (err.response) {
          if (err.response.status === 401) {
            if (
              localStorage.getItem("token") &&
              err.response.data.message === "Token expired"
            ) {
              alert("Token expired, please log in again");
            }
            if (err?.request?.responseURL?.includes("/api/")) {
              localStorage.setItem("token", "");
              window.location.assign("/"); // refresh page
            }
          }
        } else {
          //alert(err);
        }
        return Promise.reject(err);
      });
  }

  // 🆕 Position rule management
  public static updatePositionRule(
    rule: {
      symbol: string;
      option?: string;
      stopLoss?: number;
      stopLossOnUnderlying?: number;
      target?: number;
      targetOnUnderlying?: number;
    },
    accountType: string,
  ) {
    return this.request(
      `api/trade/position-rule?accountType=${accountType}`,
      "patch",
      {
        symbol: rule.symbol,
        option: rule.option,
        stop_loss: rule.stopLoss,
        stop_loss_on_underlying: rule.stopLossOnUnderlying,
        target: rule.target,
        target_on_underlying: rule.targetOnUnderlying,
        is_active: true,
      },
    );
  }

  public static deletePositionRule(ruleId: number) {
    return this.request(
      `api/trade/position-rule?ruleId=${ruleId}`,
      "delete",
    );
  }
}
