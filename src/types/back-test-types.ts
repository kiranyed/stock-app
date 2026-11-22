import { PeriodType } from "../shared/constants";
import { IGainFormatted } from "./strategy-types";

export interface IPolygonCandleResponse {
  results: IPolygonCandle[];
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
}

export interface IPolygonCandle {
  v: number; // volume
  vw?: number; // volume-weighted average price
  o: number; // open
  c: number; // close
  h: number; // high
  l: number; // low
  t: number; // timestamp (ms)
  n?: number; // number of trades
}

export interface ICandleData {
  empty: boolean;
  index: number;
  candles: ICandle[];
  symbol: string;
}
export interface ICandleDataMap {
  [key: string]: ICandleData;
}

export interface ITestConfig {
  startTime: number;
  endTime: number;
  analyze?: boolean;
  minimumPeriod?: PeriodType;
  shared?: boolean;
}

export interface ICandle {
  open: number;
  close: number;
  high: number;
  low: number;
  datetime: number;
  volume: number;
}

export interface ISimpleCandle {
  price: number;
  time: number;
  datetime: number;
}

export interface IRange {
  start?: string | number;
  end?: string | number;
}

export interface IGainTotal {
  gains: IGainFormatted[];
  total: number;
  tradeNum: number;
  avgTrade: number;
  name: string;
}
