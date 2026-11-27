import { IBackTestScreenerJob, IFilterData, IStockData } from "../types/data-processing-types";
import { IFilter } from "../types/strategy-types";
import { PeriodType } from "../shared/constants";
import { FilterVariable, primaryVariable } from "../engine/filter-specs";

export interface IVariableCheckRow {
  symbol: string;
  time: number;
  [key: string]: number | string;
}

export class VariableCheckBackTest implements IBackTestScreenerJob {
  private readonly vars: IFilterData = {};
  private readonly variables: FilterVariable[];
  private readonly latestRowsBySymbol = new Map<string, IVariableCheckRow>();

  constructor(filters: IFilter[]) {
    const byName = new Map<string, FilterVariable>();
    for (const f of filters) {
      const v = primaryVariable(f, PeriodType.DAY);
      byName.set(v.name, v);
    }
    this.variables = [...byName.values()];
  }

  getName(): string {
    return "variable-check";
  }

  getConfigId(): number {
    return -1;
  }

  getPeriod(): PeriodType {
    return PeriodType.DAY;
  }

  getVars(): IFilterData {
    return this.vars;
  }

  getVariables(): FilterVariable[] {
    return this.variables;
  }

  run(time: number, stockData: IStockData[]): void {
    stockData.forEach((stockItem) => {
      const row: IVariableCheckRow = { symbol: stockItem.symbol, time };
      this.variables.forEach(({ name }) => {
        row[name] = this.vars[name]?.[stockItem.symbol] ?? NaN;
      });
      this.latestRowsBySymbol.set(stockItem.symbol, row);
    });
  }

  getTestResults(): IVariableCheckRow[] {
    return Array.from(this.latestRowsBySymbol.values()).sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    );
  }

  getRequestedVariables(): string[] {
    return this.variables.map((v) => v.name);
  }
}
