import { IBackTestScreenerJob, IFilterData, IStockData } from "../types/data-processing-types";
import { IFilter } from "../types/strategy-types";
import { CONSTANTS, PeriodType } from "../shared/constants";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { VariableBuilders, VariablePatterns } from "../shared/utilities/variable-patterns";
import {
  resolveFilterVariables,
  resolvePrimaryVariable,
} from "../shared/utilities/filter-variable-resolver";
import { IAllFilterData } from "../types/data-processing-types";

export interface IVariableCheckRow {
  symbol: string;
  time: number;
  [key: string]: number | string;
}

export class VariableCheckBackTest implements IBackTestScreenerJob {
  private readonly vars: IFilterData = {};
  private readonly allVariables: string[];
  private readonly requestedVariables: string[];
  private readonly latestRowsBySymbol = new Map<string, IVariableCheckRow>();

  constructor(private readonly variables: IFilter[]) {
    this.requestedVariables = variables.map((variable) =>
      resolvePrimaryVariable(variable),
    );

    const dependencies = variables.flatMap((variable) =>
      resolveFilterVariables(variable),
    );
    this.allVariables = Array.from(
      new Set([...dependencies, ...this.requestedVariables]),
    );
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

  getAdditionalPeriods(): PeriodType[] {
    const periods = this.allVariables
      .filter((variable) => VariablePatterns.vwap.test(variable))
      .map((variable) => parseInt(variable.substring(4), 10))
      .filter((period): period is PeriodType => StrategyUtil.isPeriodType(period));

    return Array.from(new Set(periods));
  }

  getCrossPeriodVars(): Partial<IAllFilterData> {
    const crossPeriodVars: Partial<IAllFilterData> = {};
    this.getAdditionalPeriods().forEach((period) => {
      crossPeriodVars[period] = {
        [VariableBuilders.vwapNumeratorCumulative()]: {},
        [VariableBuilders.vwapDenominatorCumulative()]: {},
      };
    });
    return crossPeriodVars;
  }

  getVars(): IFilterData {
    return this.vars;
  }

  getAllVariables(): string[] {
    return this.allVariables;
  }

  canRun(minutesSinceStart: number): boolean {
    return (
      minutesSinceStart ===
      CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME
    );
  }

  run(time: number, stockData: IStockData[]): void {
    stockData.forEach((stockItem) => {
      const row: IVariableCheckRow = { symbol: stockItem.symbol, time };
      this.requestedVariables.forEach((variable) => {
        row[variable] = this.vars[variable]?.[stockItem.symbol] ?? NaN;
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
    return this.requestedVariables;
  }
}
