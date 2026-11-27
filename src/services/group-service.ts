import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import StockGroupRepository from "../shared/services/repos/stock-group-repository";
import { IStockGroup, IStockGroupEntity } from "../types/entity-types";
import { deleteUnlessReferenced, refuseIfHistory } from "./run-history";

/** What a caller sends to create or change a group. */
export interface IGroupInput {
  name: unknown;
  symbols: unknown;
}

/** Stock groups, always on behalf of one user. REST routes and MCP tools both call this. */
export class GroupService {
  static listNames(userId: number): Promise<{ id: number; name: string }[]> {
    return StockGroupRepository.getAllStockGroupNames(userId).then((rows) =>
      rows.map(({ id, name }) => ({ id, name })),
    );
  }

  static async list(userId: number): Promise<IStockGroup[]> {
    return (await StockGroupRepository.getAllStockGroups(userId)).map(toGroup);
  }

  /** The group, or 404 if it doesn't exist or belongs to someone else. */
  static async get(userId: number, id: number): Promise<IStockGroup> {
    const [row] = await StockGroupRepository.getOwnedGroup(id, userId);
    if (!row) throw new Error404("group not found");
    return toGroup(row);
  }

  static async create(userId: number, input: IGroupInput): Promise<IStockGroup> {
    const { name, symbols } = validate(input);
    const id = await StockGroupRepository.createGroup(name, symbols, userId);
    return { id, name, symbols };
  }

  static async update(userId: number, id: number, input: IGroupInput): Promise<IStockGroup> {
    const { name, symbols } = validate(input);
    const matched = await StockGroupRepository.updateGroup(id, userId, name, symbols);
    if (!matched) throw new Error404("group not found");
    return { id, name, symbols };
  }

  /**
   * Deletes all of `ids`, or nothing: 404 if any is missing or belongs to someone else,
   * 409 if any has runs or saved back-test results (that history is kept).
   */
  static async remove(userId: number, ids: number[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) throw new Error400("Must pass an id or multiple ids of stock groups to delete");
    const owned = await StockGroupRepository.getOwnedIds(unique, userId);
    if (owned.length !== unique.length) throw new Error404("group not found");
    refuseIfHistory("group", await StockGroupRepository.getHistoryCounts(unique, userId));
    await deleteUnlessReferenced("group", () => StockGroupRepository.deleteGroups(unique, userId));
  }
}

/** A positive integer id, from a path or query value. */
const validate = ({ name, symbols }: IGroupInput): { name: string; symbols: string[] } => {
  if (typeof name !== "string" || !name.match(/^[a-zA-Z0-9 ]+$/)) {
    throw new Error400("name must consist of alphanumeric characters");
  }
  if (!Array.isArray(symbols)) {
    throw new Error400("symbols must be an array");
  }
  if (!symbols.every((symbol) => typeof symbol === "string")) {
    throw new Error400("every symbol must be a string");
  }
  return { name, symbols: symbols.map((s: string) => s.trim().replace(/\r?\n/g, "")).filter(Boolean) };
};

/** Older rows store symbols as a JSON string, a bare string, or JSON already parsed by the driver. */
export const parseSymbols = (symbols: unknown): string[] => {
  if (Array.isArray(symbols)) return symbols.map(String);
  if (typeof symbols !== "string") return [];
  const trimmed = symbols.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return [trimmed];
  }
};

const toGroup = (row: IStockGroupEntity): IStockGroup => ({
  id: row.id,
  name: row.name,
  symbols: parseSymbols(row.symbols),
});
