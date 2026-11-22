export interface IStrategyEntity {
  id: number;
  name: string;
  description: string;
  screeners: string;
  date_added?: number;
  period: number;
  user_id: number;
}

export interface IStockGroup {
  id: number;
  symbols: string[];
  name: string;
}

export type IStrategyEntityNew = Omit<IStrategyEntity, "id">;

export interface IStockGroupEntity {
  id: number;
  name: string;
  symbols: string;
  date_added?: string;
  user_id: number;
}
export type NewType<T> = Omit<T, "id">;

export type IStockGroupEntityNew = Omit<IStockGroupEntity, "id">;

export interface User {
  username: string;
  password: string;
  id?: number;
}

export interface SimulationRunEntity {
  id: number;
  start_time: number;
  end_time: number;
  strategy_id: number;
  group_id: number;
  status: string;
}

export interface RealRunEntity {
  id: number;
  start_time: number;
  end_time: number;
  strategy_id: number;
  group_id: number;
  status: string;
}

export interface IStrategyRun {
  id: number;
  startTime: number;
  endTime: number;
  status: string;
  groupId: number;
  strategyId: number;
  positionSize: number;
  /* last time to open any position */
  openBy: number;
  /* last time to close position */
  closeBy: number;
}

export interface ILiveJobRunEntity {
  id: number;
  start_time: number;
  end_time: number;
  strategy_id: number;
  group_id: number;
  status: string;
  position_size: number;
  open_by: number;
  close_by: number;
}

export interface Transaction {
  id?: number;
  symbol: string;
  datetime: number;
  quantity: number;
  netPercentGain: number;
  netGain: number;
  simulation: boolean;
}

export interface TransactionEntity {
  id?: number;
  symbol: string;
  datetime: number;
  quantity: number;
  net_percent_gain: number;
  net_gain: number;
  run_id?: number;
  simulation: boolean;
}

export interface IStockInfo {
  symbol: string;
  marketCap: number;
  labels: string;
}

export interface IStockInfoEntity {
  market_cap: number;
  symbol: string;
  labels: string;
}

export interface IPositionRule {
  id: number;
  account_type: string;
  symbol: string;
  option?: string;
  stop_loss?: number;
  stop_loss_on_underlying?: number;
  target?: number;
  target_on_underlying?: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export type IPositionRuleNew = Omit<IPositionRule, "id" | "created_at" | "updated_at">;
