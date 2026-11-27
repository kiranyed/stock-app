import { PeriodType } from "../shared/constants";
import { IGainTotal } from "./back-test-types";
import { IData } from "./general-types";
import { FilterVariable } from "../engine/filter-specs";

// shout out chatgbt
export type PartialPeriodRecord<ValueType> = Partial<
  Record<PeriodType, ValueType>
>;

export type IAllFilterData = Record<PeriodType, IFilterData>;
export type IAllStockNames = Record<PeriodType, string[]>;

export interface IFilterData {
  [filterName: string]: { [stockName: string]: number };
}

export interface IStockData {
  symbol: string;
  price: number;
  datetime: number;
  tradePrice?: number;
  close?: number;
  volume: number;
}

export interface IStockDataLive extends IStockData {
  price: number;
}

export interface IStockDataBackTest extends IStockData {
  open: number;
  close: number;
  high: number;
  low: number;
}

export interface IStockDataMap {
  [key: string]: IStockData;
}

export interface IStockScreenerJob extends IJob {
  getName(): string;
  getPeriod(): PeriodType;
  /** every variable the job reads; the master job computes and fills them */
  getVariables(): FilterVariable[];
  /** the job's variable values, [name][symbol]; the master job writes engine values here */
  getVars(): IFilterData;
  run(time: number, stockData: IStockData[]): void;
  getConfigId(): number;
}

export interface ILiveStockScreenerJob extends IStockScreenerJob {
  getId(): number;
  setId(id: number): void;
}

export interface IBackTestScreenerJob extends IStockScreenerJob {
  getTestResults(): IData[] | IGainTotal;
}

export interface IAnalysisConfig {
  period: PeriodType;
  startTime: number;
  endTime: number;
}

export interface IJob {
  run(...args: unknown[]): void;
  clearIntradayStateData?(): void;
  runDailyMaintenance?(): void;
}
