import { DatabaseAPI } from "../db-api";

export interface IPaperPosition {
  run_id: number;
  symbol: string;
  is_long: boolean;
  entry_price: number;
  entry_time: number;
  quantity: number;
  /** The id of the screener that entered it (StrategySimulation.screenerId). */
  screener_key: string;
}

/** `paper_position` rows (db/paper-position.sql): the open positions of live strategy runs. */
export default class PaperPositionRepository {
  /** Stores an open position, replacing one the run already holds in the symbol. */
  static open(p: IPaperPosition): Promise<number> {
    return DatabaseAPI.modify(
      "insert into paper_position (run_id, symbol, is_long, entry_price, entry_time, quantity, screener_key) " +
        "values (?, ?, ?, ?, ?, ?, ?) on duplicate key update is_long = values(is_long), entry_price = values(entry_price), " +
        "entry_time = values(entry_time), quantity = values(quantity), screener_key = values(screener_key)",
      [p.run_id, p.symbol, p.is_long, p.entry_price, p.entry_time, p.quantity, p.screener_key],
    );
  }

  static close(runId: number, symbol: string): Promise<number> {
    return DatabaseAPI.modify("delete from paper_position where run_id = ? and symbol = ?", [runId, symbol]);
  }

  /** The open positions of `runIds`, by run. */
  static async forRuns(runIds: number[]): Promise<Map<number, IPaperPosition[]>> {
    const byRun = new Map<number, IPaperPosition[]>();
    if (!runIds.length) return byRun;
    const rows = await DatabaseAPI.query<IPaperPosition>(
      "select run_id, symbol, is_long, entry_price, entry_time, quantity, screener_key from paper_position " +
        "where run_id in (?) order by id",
      [runIds],
    );
    for (const row of rows) {
      const position = { ...row, is_long: Boolean(row.is_long) };
      byRun.set(row.run_id, [...(byRun.get(row.run_id) ?? []), position]);
    }
    return byRun;
  }

  /** Forgets the positions of runs that have ended. */
  static deleteForRuns(runIds: number[]): Promise<number> {
    if (!runIds.length) return Promise.resolve(0);
    return DatabaseAPI.modify("delete from paper_position where run_id in (?)", [runIds]);
  }
}
