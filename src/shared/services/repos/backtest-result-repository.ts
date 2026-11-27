import { DatabaseAPI } from "../db-api";

export interface BacktestResultInsert {
  strategyId: number;
  groupId: number;
  strategyName?: string;
  groupName?: string;
  startTime: number;
  endTime: number;
  period?: number;
  direction?: string;
  params?: unknown;
  returnPct?: number;
  winRate?: number;
  trades?: number;
  sharpe?: number;
  maxDrawdown?: number;
  dataSource?: string | null;
  status?: string;
  runtimeMs?: number;
  createdAt: number;
}

export interface BacktestResultRow {
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

/** `backtest_result` rows. Like runs, a result belongs to whoever owns its strategy. */
export class BacktestResultRepository {
  /** Saves one result; returns its id. */
  static insert(result: BacktestResultInsert): Promise<number> {
    const r = result;
    return DatabaseAPI.insert(
      "insert into backtest_result (strategy_id, group_id, strategy_name, group_name, start_time, end_time, " +
        "period, direction, params, return_pct, win_rate, trades, sharpe, max_drawdown, data_source, status, " +
        "runtime_ms, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        r.strategyId,
        r.groupId,
        r.strategyName ?? null,
        r.groupName ?? null,
        r.startTime,
        r.endTime,
        r.period ?? null,
        r.direction ?? null,
        r.params ? JSON.stringify(r.params) : null,
        r.returnPct ?? null,
        r.winRate ?? null,
        r.trades ?? null,
        r.sharpe ?? null,
        r.maxDrawdown ?? null,
        r.dataSource ?? null,
        r.status ?? "SUCCESS",
        r.runtimeMs ?? null,
        r.createdAt,
      ],
    );
  }

  /** The user's successful results for a group, newest first, optionally for some strategies only. */
  static getCompletedByGroup(userId: number, groupId: number, strategyIds?: number[]): Promise<BacktestResultRow[]> {
    const byStrategy = strategyIds?.length ? " and r.strategy_id in (?)" : "";
    return DatabaseAPI.query<BacktestResultRow>(
      "select r.id, r.strategy_id as strategyId, r.group_id as groupId, r.strategy_name as strategyName, " +
        "r.group_name as groupName, r.start_time as startTime, r.end_time as endTime, r.return_pct as returnPct, " +
        "r.trades, r.status, r.created_at as createdAt from backtest_result r " +
        "join strategy s on s.id = r.strategy_id " +
        `where r.group_id = ? and s.user_id = ? and r.status = 'SUCCESS'${byStrategy} order by r.created_at desc`,
      strategyIds?.length ? [groupId, userId, strategyIds] : [groupId, userId],
    );
  }
}

export default BacktestResultRepository;
