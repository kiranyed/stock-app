import { Nullable } from "primereact/ts-helpers";
import React from "react";

export interface IUser {
  username: string;
  password: string;
}

export interface IGain {
  time: number;
  gain: number;
}

export interface IAnalysisData {
  time: number;
  symbol: string;
  [key: string]: string | number;
}

export interface IStrategyWithIndex extends IStrategy {
  idx: number;
}
export interface IStrategy {
  id: number;
  screeners: IScreener[];
  name: string;
  description: string;
  period: number;
}

export type IScreener = RequireAtLeastOne<
  Screener,
  "buySellFilters" | "shortCoverFilters"
>;

export enum TransactionType {
  BUY = "buy",
  SELL = "sell",
  SHORT = "short",
  COVER = "cover",
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

interface Screener {
  id?: string;
  buySellFilters?: IFilterGroupPair;
  shortCoverFilters?: IFilterGroupPair;
}

export interface IFilterGroup {
  filters: IFilter[];
  connectors: string[];
}
export interface IFlagFilterGroupPair extends IFilterGroupPair {
  name: string;
}

export interface IFilter {
  varName: string;
  operator: string;
  compareVal: string;
  compareVar?: string;
  compareVarTimeAgo?: string;
  timeAgo?: string;
  numberOfSessions?: string;
  discriminator: string;
  type?: string;
  compareVarCoefficient?: string;
}

export type IVariableDefinition = Omit<IFilter, "operator" | "compareVal"> &
  Partial<Pick<IFilter, "operator" | "compareVal">>;

export interface IVariableCheckRow {
  symbol: string;
  time: number;
  [key: string]: string | number;
}

export interface IVariableCheckResponse {
  variables: string[];
  rows: IVariableCheckRow[];
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
  signalPeriod?: number;
}

export interface IMacdCrossOverFilter extends IMACDFilter {
  periodsBefore: number;
  periodsAfter: number;
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
  vwapPeriod?: number; //optional, used for MTSI with VWAP
}

export interface IFilterGroupPair {
  enter: IFilterGroup;
  exit: IFilterGroup;
}

export type NameIdPair = { name: string; id: number };

export interface ITransaction {
  id: number;
  runId: number;
  netPercentGain: number;
  symbol: string;
  datetime: number;
  name: string;
}

export interface IStrategyRun {
  id: number;
  strategyName: string;
  groupName: string;
  startTime: number;
}

export interface IBacktestResultRow {
  id: number;
  strategyId: number;
  groupId: number;
  strategyName: string | null;
  groupName: string | null;
  startTime: number;
  endTime: number;
  returnPct: number | null;
  trades: number | null;
  status: string | null;
  createdAt: number;
}

export interface IAnalysisState {
  filters: IFilter[];
  dataFilters: IFilter[];
  startDate: Nullable<Date>;
  endDate: Nullable<Date>;
  group: NameIdPair;
}

export type ReactEvent = React.ChangeEvent<HTMLInputElement>;

export type ChipsEvent = React.ChangeEvent<HTMLInputElement>;

export interface IDropDownItem {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface IStockNameData {
  data: {
    names: string;
  };
}

export interface IPriceQuotes {
  [key: string]: { bid: number; ask: number };
}
export interface IUserToken {
  token: string;
}

/** GET /api/settings */
export interface IAppSettings {
  deployment: "self-hosted" | "hosted";
  marketData: { provider: string; schwabSignIn: boolean };
  alerts: { email: boolean; sms: boolean };
  backTests: { workers: number; perUser: number; timeoutMs: number };
}

/** GET /api/schwab/status */
export interface ISchwabStatus {
  signedIn: boolean;
  /** null when the sign-in time is unknown */
  refreshExpiresAt: number | null;
  accessExpiresAt: number | null;
}
