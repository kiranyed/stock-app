import { PeriodType, MemoryType } from "../shared/constants";
import { ICandle, IGainTotal } from "./back-test-types";
import { IData } from "./general-types";

// shout out chatgbt
export type PartialPeriodRecord<ValueType> = Partial<
  Record<PeriodType, ValueType>
>;

export type IAllMemory = Record<PeriodType, Record<string, IMemory>>;
export type IAllMemoryBackTest = Record<
  PeriodType,
  Record<MemoryType, IMemoryBackTest>
>;

export type IAllFilterData = Record<PeriodType, IFilterData>;
export type IAllStockNames = Record<PeriodType, string[]>;

export interface IInitializedJobData {
  newNames: IAllStockNames;
  newFilterData: IAllFilterData;
  newMemories: IAllMemory;
}

export interface IMemory {
  [stockName: string]: { space: number; list: number[]; lastTime: number };
}

export interface IMemoryBackTest {
  [stockName: string]: { space: number; list: ICandle[]; lastTime: number };
}

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
  getAdditionalPeriods(): PeriodType[];
  getCrossPeriodVars(): Partial<IAllFilterData>;
  getVars(): IFilterData;
  run(time: number, stockData: IStockData[]): void;
  getAllVariables(): string[];
  canRun(minutesSinceStart: number): boolean;
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

export interface IHistogramData {
  /** 21 edges defining 20 fixed bins from -20% to +20% in 2% steps */
  binEdges: number[];
  /** count of values in each bin */
  counts: number[];
  totalCount: number;
}

/** [period][variableKey][symbol] => IHistogramData */
export type IAllHistograms = Partial<Record<PeriodType, Record<string, Record<string, IHistogramData>>>>;
