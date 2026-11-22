import { Screener } from "../shared/classes/screener";
import { PeriodType } from "../shared/constants";

export interface IFilter {
  varName: string;
  operator: string;
  compareVal: string;
  compareVarCoefficient?: string;
  compareVar?: string;
  compareVarTimeAgo?: string;
  timeAgo?: string;
  numberOfSessions?: string;
}

export interface IVariable {
  varName: string;
}

export interface IPercentileRankFilter extends IFilter {
  percentile: number; //default is 50
}

export interface IFlagFilterGroupPair extends IFilterGroupPair {
  name: string;
}

export interface IMACDFilter extends IFilter {
  fastPeriod: number; //default is 12
  slowPeriod: number; //default is 26
}

export interface IMacdCrossOverFilter extends IMACDFilter {
  periodsBefore: number;
  periodsAfter: number;
  bullish?: boolean;
}

export interface IRSIFilter extends IFilter {
  period: number; //default is 14
}

export interface IBollingerBandsFilter extends IFilter {
  period: number; //default is 20
  multiplier: number; //default is 2
}

export interface IAdxFilter extends IFilter {
  period: number; //default is 14
  threshold: number; //default is 20
}

export interface IMTSIFilter extends IFilter {
  emaPeriod1: number;
  emaPeriod2: number;
  vwapPeriod: number;
}

export interface IRsiDivergenceFilter extends IRSIFilter {
  bullish: boolean;
  lookback: number;
  periodsAfter: number;
  periodsBefore: number;
}

export interface IMacdDivergenceFilter extends IMACDFilter {
  bullish: boolean;
  lookback: number;
  periodsAfter: number;
  periodsBefore: number;
}

export interface IRsiCrossoverFilter extends IRSIFilter {
  bullish: boolean;
  periodsAfter: number;
  periodsBefore: number;
  period: number;
  crossoverLevel: number;
}

export interface IPricePercentChangePercentileFilter extends IFilter {
  period?: string;
  lookback?: number;
  timeAgo: string;
  numberOfSessions?: string;
}

export interface IMacdCrossOverFilter extends IMACDFilter {
  signalPeriod: number;
  periodsBefore: number;
  periodsAfter: number;
  crossoverLevel: number;
}

export interface IGain {
  symbol: string;
  gain: number;
  time: number;
  timeFormatted?: string;
  atClose: boolean;
  lowestLossPercent?: number;
  lowestLossTime?: number;
  highestGainPercent?: number;
  highestGainTime?: number;
  enteredTime?: number;
  enteredTimeFormatted?: string;
  test?: boolean;
}

export interface IGainFormatted {
  symbol: string;
  gainPercent: number;
  timeFormatted: string;
  atClose: boolean;
  enteredTimeFormatted: string;
}

export interface IFilterGroup {
  filters: IFilter[];
  connectors: string[];
  flags?: string[];
}

// https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  //Exclude<keyof T, Keys>
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

interface IScreenerOptional {
  flags?: IFlagFilterGroupPair[];
  buySellFilters?: IFilterGroupPair;
  shortCoverFilters?: IFilterGroupPair;
}

export type IScreener = RequireAtLeastOne<
  IScreenerOptional,
  "buySellFilters" | "shortCoverFilters"
>;

export interface IStrategyNew {
  screeners: IScreener[];
  name: string;
  description: string;
  period: PeriodType;
}

export interface IStrategy {
  id: number;
  screeners: IScreener[];
  name: string;
  description: string;
  period: PeriodType;
}

export interface IFilterGroupPair {
  enter: IFilterGroup;
  exit: IFilterGroup;
}

export interface IAction {
  price: number;
  orderType: string;
  screener?: Screener;
  symbol: string;
  time: number;
  atClose?: boolean;
}

export interface IEnterAction {
  price: number;
  orderType: string;
  screener: Screener;
  symbol: string;
  time: number;
}
