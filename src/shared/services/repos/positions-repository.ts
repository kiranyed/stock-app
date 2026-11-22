import { IPositionRule, IPositionRuleNew } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class PositionsRepository {
  private static runQuery<T = IPositionRule>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }

  private static escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Create or update a position rule.
   * Overwrites existing rule by (account_type, symbol) so edits do not create duplicates.
   */
  public static async upsert(rule: IPositionRuleNew): Promise<unknown> {
    const now = Date.now();
    const created_at = now;
    const updated_at = now;

    const normalizedSymbol = rule.symbol.replace(/ /g, "").trim().toUpperCase();
    const accountType = String(rule.account_type).trim();
    const optionValue = typeof rule.option === "string" ? rule.option.trim() : "";

    if (!accountType || !normalizedSymbol) {
      throw new Error("account_type and symbol are required");
    }

    const escapedAccountType = this.escapeSqlString(accountType);
    const escapedSymbol = this.escapeSqlString(normalizedSymbol);

    const existing = await this.runQuery<{ id: number }>(
      `SELECT id FROM positions WHERE account_type='${escapedAccountType}' AND symbol='${escapedSymbol}' ORDER BY updated_at DESC, id DESC LIMIT 1`,
    );

    const toSqlValue = (val: unknown) => {
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "string") return `'${this.escapeSqlString(val)}'`;
      return String(val);
    };

    const nextOption = optionValue || null;
    const nextStopLoss = rule.stop_loss ?? null;
    const nextStopLossOnUnderlying = rule.stop_loss_on_underlying ?? null;
    const nextTarget = rule.target ?? null;
    const nextTargetOnUnderlying = rule.target_on_underlying ?? null;
    const nextIsActive = rule.is_active ?? true;

    if (existing.length) {
      const existingId = existing[0].id;
      const updateQuery =
        "UPDATE positions SET " +
        "`option`=" +
        toSqlValue(nextOption) +
        ", stop_loss=" +
        toSqlValue(nextStopLoss) +
        ", stop_loss_on_underlying=" +
        toSqlValue(nextStopLossOnUnderlying) +
        ", target=" +
        toSqlValue(nextTarget) +
        ", target_on_underlying=" +
        toSqlValue(nextTargetOnUnderlying) +
        ", is_active=" +
        toSqlValue(nextIsActive) +
        ", updated_at=" +
        updated_at +
        ` WHERE id=${existingId}`;

      const cleanupQuery =
        `DELETE FROM positions WHERE account_type='${escapedAccountType}' AND symbol='${escapedSymbol}' AND id<>${existingId}`;

      return this.runQuery(`${updateQuery};${cleanupQuery}`);
    }

    const query =
      "INSERT INTO positions (" +
      "account_type,symbol,`option`,stop_loss,stop_loss_on_underlying,target,target_on_underlying,is_active,created_at,updated_at" +
      ") VALUES (" +
      [
        toSqlValue(accountType),
        toSqlValue(normalizedSymbol),
        toSqlValue(nextOption),
        toSqlValue(nextStopLoss),
        toSqlValue(nextStopLossOnUnderlying),
        toSqlValue(nextTarget),
        toSqlValue(nextTargetOnUnderlying),
        toSqlValue(nextIsActive),
        created_at,
        updated_at,
      ].join(",") +
      ")";

    return this.runQuery<number>(query);
  }

  /**
   * Get all active position rules for a given account
   */
  public static getActiveRulesByAccount(
    accountType: string,
  ): Promise<IPositionRule[]> {
    return this.runQuery(
      `SELECT * FROM positions WHERE account_type='${accountType}' AND is_active=true`,
    );
  }

  /**
   * Get a single position rule by account, symbol, and optional option
   */
  public static getRuleBySymbol(
    accountType: string,
    symbol: string,
    option?: string,
  ): Promise<IPositionRule[]> {
    const optionClause = option
      ? "AND `option`='" + option + "'"
      : "AND `option` IS NULL";
    return this.runQuery(
      `SELECT * FROM positions WHERE account_type='${accountType}' AND symbol='${symbol}' ${optionClause}`,
    );
  }

  /**
   * Hard delete a position rule by ID
   */
  public static deleteRule(id: number): Promise<unknown> {
    return this.runQuery(`DELETE FROM positions WHERE id=${id}`);
  }

  /**
   * Soft deactivate a position rule after it has triggered (set is_active=false)
   */
  public static deactivateRuleAfterExit(id: number): Promise<unknown> {
    return this.runQuery(
      `UPDATE positions SET is_active=false, updated_at=${Date.now()} WHERE id=${id}`,
    );
  }

  /**
   * Get active rules for a list of symbols in a given account
   */
  public static listRulesForSymbols(
    accountType: string,
    symbols: string[],
  ): Promise<IPositionRule[]> {
    if (symbols.length === 0) return Promise.resolve([]);
    const symbolList = symbols.map((s) => `'${s}'`).join(",");
    return this.runQuery(
      `SELECT * FROM positions WHERE account_type='${accountType}' AND symbol IN (${symbolList}) AND is_active=true`,
    );
  }

  /**
   * Delete all inactive rules (cleanup stale rules that are no longer needed)
   */
  public static deleteInactiveRules(): Promise<unknown> {
    return this.runQuery(`DELETE FROM positions WHERE is_active=false`);
  }

  /**
   * Delete rules for symbols that are not in the provided list (stale cleanup)
   */
  public static deleteRulesNotInSymbols(
    accountType: string,
    activeSymbols: string[],
  ): Promise<unknown> {
    if (activeSymbols.length === 0) {
      // If no active symbols, delete all rules for this account
      return this.runQuery(
        `DELETE FROM positions WHERE account_type='${accountType}' AND is_active=true`,
      );
    }
    const symbolList = activeSymbols.map((s) => `'${s}'`).join(",");
    return this.runQuery(
      `DELETE FROM positions WHERE account_type='${accountType}' AND is_active=true AND symbol NOT IN (${symbolList})`,
    );
  }
}
