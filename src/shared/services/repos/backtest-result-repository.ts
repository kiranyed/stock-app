import mysql from "mysql2";
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

export class BacktestResultRepository {
  static async insert(result: BacktestResultInsert) {
    if (!DatabaseAPI.connectionExists()) {
      await DatabaseAPI.createConnection();
    }

    const {
      strategyId,
      groupId,
      strategyName,
      groupName,
      startTime,
      endTime,
      period,
      direction,
      params,
      returnPct,
      winRate,
      trades,
      sharpe,
      dataSource,
      status,
      runtimeMs,
      createdAt,
    } = result;

    const jsonParams = params ? mysql.escape(JSON.stringify(params)) : "NULL";

    const query = `INSERT INTO backtest_result (
      strategy_id, group_id, strategy_name, group_name, start_time, end_time, period, direction, params,
      return_pct, win_rate, trades, sharpe, data_source, status, runtime_ms, created_at
    ) VALUES (
      ${mysql.escape(strategyId)},
      ${mysql.escape(groupId)},
      ${mysql.escape(strategyName ?? null)},
      ${mysql.escape(groupName ?? null)},
      ${mysql.escape(startTime)},
      ${mysql.escape(endTime)},
      ${mysql.escape(period ?? null)},
      ${mysql.escape(direction ?? null)},
      ${jsonParams},
      ${mysql.escape(returnPct ?? null)},
      ${mysql.escape(winRate ?? null)},
      ${mysql.escape(trades ?? null)},
      ${mysql.escape(sharpe ?? null)},
      ${mysql.escape(dataSource ?? null)},
      ${mysql.escape(status ?? "SUCCESS")},
      ${mysql.escape(runtimeMs ?? null)},
      ${mysql.escape(createdAt)}
    )`;

    return DatabaseAPI.runQuery(query);
  }

  static async getCompletedByGroup(groupId: number, strategyIds?: number[]) {
    if (!DatabaseAPI.connectionExists()) {
      await DatabaseAPI.createConnection();
    }

    const strategyFilter =
      Array.isArray(strategyIds) && strategyIds.length
        ? ` AND strategy_id IN (${strategyIds.map((id) => mysql.escape(id)).join(", ")})`
        : "";

    const query = `SELECT
      id,
      strategy_id AS strategyId,
      group_id AS groupId,
      strategy_name AS strategyName,
      group_name AS groupName,
      start_time AS startTime,
      end_time AS endTime,
      return_pct AS returnPct,
      trades,
      status,
      created_at AS createdAt
    FROM backtest_result
    WHERE group_id = ${mysql.escape(groupId)}
      AND status = 'SUCCESS'${strategyFilter}
    ORDER BY created_at DESC`;

    return DatabaseAPI.runQuery<BacktestResultRow>(query);
  }
}

export default BacktestResultRepository;
