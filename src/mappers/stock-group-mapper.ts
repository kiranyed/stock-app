import { IStockGroup, IStockGroupEntity } from "../types/entity-types";

const normalizeSymbols = (symbols: unknown): string[] => {
  if (Array.isArray(symbols)) {
    return symbols.map(String);
  }

  if (typeof symbols === "string") {
    const trimmed = symbols.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
      return [];
    } catch {
      return trimmed
        .split(",")
        .map((symbol) => symbol.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const StockGroupMapper = {
  parseSymbols(symbols: unknown): string[] {
    return normalizeSymbols(symbols);
  },

  convertEntityToGroup(entity: IStockGroupEntity): IStockGroup {
    return {
      id: entity.id,
      name: entity.name,
      symbols: this.parseSymbols(entity.symbols),
    };
  },
  convertGroupToEntity(group: IStockGroup, userId: number): IStockGroupEntity {
    return {
      id: group.id,
      name: group.name,
      symbols: group.symbols.join(","),
      user_id: userId,
    };
  },
};

export default StockGroupMapper;
