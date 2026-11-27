import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import StrategyMapper from "../mappers/strategy-mapper";
import StrategyRepository from "../shared/services/repos/strategy-repository";
import { IStrategy } from "../types/strategy-types";
import { deleteUnlessReferenced, refuseIfHistory } from "./run-history";
import { validateStrategyInput } from "./strategy-validation";

/** Strategies, always on behalf of one user. REST routes and MCP tools both call this. */
export class StrategyService {
  static async list(userId: number): Promise<IStrategy[]> {
    return (await StrategyRepository.getAllStrategies(userId)).map((e) =>
      StrategyMapper.convertEntityToStrategy(e),
    );
  }

  static async listNames(userId: number): Promise<{ id: number; name: string }[]> {
    return (await StrategyRepository.getAllNames(userId)).map(({ id, name }) => ({ id, name }));
  }

  static async getByNames(userId: number, names: string[]): Promise<IStrategy[]> {
    return (await StrategyRepository.getByName(names, userId)).map((e) =>
      StrategyMapper.convertEntityToStrategy(e),
    );
  }

  /** Validates and saves a new strategy; returns its id. */
  static async create(userId: number, input: unknown): Promise<{ id: number }> {
    const strategy = validateStrategyInput(input);
    const { insertId } = await StrategyRepository.createStrategy([strategy], userId);
    return { id: insertId };
  }

  /**
   * Validates and saves the user's strategy. Screeners sent without an id keep the id of an
   * identical stored screener (see carryOverIds), so their open positions stay attached.
   */
  static async update(userId: number, id: number, input: unknown): Promise<IStrategy> {
    const [current] = await StrategyRepository.getOwnedStrategies([id], userId);
    if (!current) throw new Error404("strategy not found");
    const stored = StrategyMapper.convertEntityToStrategy(current).screeners;
    const strategy = validateStrategyInput(input, undefined, stored);
    const matched = await StrategyRepository.updateStrategy(id, userId, strategy);
    if (!matched) throw new Error404("strategy not found");
    return { id, ...strategy };
  }

  /**
   * Deletes all of `ids`, or nothing: 404 if any is missing or belongs to someone else,
   * 409 if any has runs or saved back-test results (that history is kept).
   */
  static async remove(userId: number, ids: number[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) throw new Error400("No ID(s) passed for strategy deletion");
    const owned = await StrategyRepository.getOwnedIds(unique, userId);
    if (owned.length !== unique.length) throw new Error404("strategy not found");
    refuseIfHistory("strategy", await StrategyRepository.getHistoryCounts(unique, userId));
    await deleteUnlessReferenced("strategy", () => StrategyRepository.deleteStrategies(unique, userId));
  }
}
