import { FilterGroup } from "../shared/classes/filter-group";
import { BackTestHelper } from "../back-testing/back-test-helper";
import { IFilter, IFilterGroup } from "../types/strategy-types";
import { IData } from "../types/general-types";
import {
  IFilterData,
  IStockData,
  IStockScreenerJob,
} from "../types/data-processing-types";
import { PeriodType } from "../shared/constants";
import { IAnalysisData } from "./analysis-types";
import { StrategyUtil } from "../shared/utilities/strategy-util";

export abstract class Analysis implements IStockScreenerJob {
  private scenarioFilterGroup: FilterGroup;
  private dataFilters: IFilter[];
  dataVars: IData[] = new Array<IData>();
  protected backTestHelper = new BackTestHelper();
  private period: PeriodType;
  private vars: IFilterData = {};
  closeTime: number = 960; // default to 4pm in minutes after midnight

  constructor(
    period: PeriodType,
    scenarioFilterGroup: IFilterGroup,
    dataFilters: IFilter[],
  ) {
    this.period = period;
    this.scenarioFilterGroup = new FilterGroup(scenarioFilterGroup);
    this.dataFilters = dataFilters;
  }

  getName() {
    return "";
  }

  //TODO implement an analysis database table similar to strategy table.
  // analysis and strategy are both types of config (maybe i should create a parent
  // interface called config?), and job runs use that config as their blueprint
  getConfigId(): number {
    return -1;
  }

  getAdditionalPeriods(): PeriodType[] {
    return []; // Return the current period as a valid PeriodType
  }

  getPeriod() {
    return this.period;
  }

  getDataFilters() {
    return this.dataFilters;
  }

  valIsNumber(val: unknown): val is number {
    return typeof val === "number";
  }

  //TODO will implement once I implement running multiple analysis at once
  canRun() {
    return true;
  }

  //abstract collectData(scenarios: IAnalysisData[]): IData[];

  run(time: number, results: IStockData[]) {
    const scenarios = new Array<IAnalysisData>();
    const filterData = this.vars;
    for (const item of results) {
      const symbol = item.symbol;
      const pass = this.scenarioFilterGroup.run(filterData, symbol);
      const variableValues: { [variableName: string]: string | number } = {};
      for (const key of Object.keys(filterData)) {
        const filterDataOfKey = filterData[key];

        if (typeof filterDataOfKey[symbol] === "number") {
          variableValues[key] = parseFloat(filterDataOfKey[symbol].toFixed(2));
        }
      }
      if (pass) {
        scenarios.push({ price: item.price, symbol, time, variableValues });
      }
    }
    this.dataVars.push(
      ...this.backTestHelper.collectData(
        scenarios,
        this.period,
        this.dataFilters,
      ),
    );
  }

  setVars(vars: IFilterData) {
    this.vars = vars;
  }

  getVars() {
    return this.vars;
  }

  getScenarioFilterGroup() {
    return this.scenarioFilterGroup;
  }

  getAllVariables(): string[] {
    const variables = new Array<string>();
    const filters = this.scenarioFilterGroup.getFilters();
    for (const filt of filters) {
      variables.push(StrategyUtil.convertToVariableName(filt));
      if (filt.compareVar) {
        variables.push(StrategyUtil.convertToCompareVarName(filt));
      }
    }
    return variables;
  }

  getCrossPeriodVars(): IFilterData {
    return {};
  }
}
