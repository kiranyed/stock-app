import { CONSTANTS, PeriodType } from "../shared/constants";
import { FilterVarsHelper } from "./filter-vars-helper";
import { MemoriesHelper } from "./memories-helper";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { IStockGroup } from "../types/entity-types";
import {
  IAllFilterData,
  IAllHistograms,
  IAllMemory,
  IAllStockNames,
  IStockData,
  IStockScreenerJob,
} from "../types/data-processing-types";
import { DataRetriever } from "./data-retriever";
import { initFilterData } from "../shared/utilities/run-util";

export class DataHandler {
  private static instances: DataHandler[] = [];
  private static filterVarsHelper: FilterVarsHelper;

  public static async getData(
    periods: PeriodType[],
    names: Partial<IAllStockNames>,
  ) {
    return DataRetriever.getData(periods, names);
  }

  private static getFilterVarsHelper(): FilterVarsHelper {
    if (!this.filterVarsHelper) {
      this.filterVarsHelper = new FilterVarsHelper();
    }
    return this.filterVarsHelper;
  }

  static initializeData(
    jobs: IStockScreenerJob[],
    group: IStockGroup,
    allCurrentStockNames: IAllStockNames,
  ): [IAllStockNames, IAllFilterData, IAllMemory] {
    const names = this.assignStockNames(
      group.symbols,
      StrategyUtil.getAllTimePeriods(jobs),
      allCurrentStockNames,
    );
    const filterVars = initFilterData();
    const vars = this.getFilterVarsHelper().initVars(filterVars, jobs, names);
    const memories = this.determineMemoriesForStocks(filterVars, names);
    return [names, vars, memories];
  }

  static processData(
    data: IStockData[],
    jobs: IStockScreenerJob[],
    datetime: number,
    timePeriods: PeriodType[],
    filterVars: IAllFilterData,
    memories: IAllMemory,
    allHistograms?: IAllHistograms,
  ): void {
    this.getFilterVarsHelper().transferVars(
      jobs,
      timePeriods,
      filterVars,
      memories,
      data,
      datetime,
      allHistograms,
    );
  }

  static processDataBackTest(
    dataMap: Partial<Record<PeriodType, IStockData[]>>,
    jobs: IStockScreenerJob[],
    datetime: number,
    timePeriods: PeriodType[],
    filterVars: IAllFilterData,
    memories: IAllMemory,
    allHistograms?: IAllHistograms,
  ): void {
    this.getFilterVarsHelper().transferVars(
      jobs,
      timePeriods,
      filterVars,
      memories,
      dataMap,
      datetime,
      allHistograms,
    );
  }

  static adjustMemory(
    memories: IAllMemory,
    data: Partial<Record<PeriodType, IStockData[]>> | IStockData[],
    timePeriods: PeriodType[],
    allVars?: IAllFilterData,
  ): void {
    if (allVars) {
      MemoriesHelper.adjustMemory(data, timePeriods, memories, allVars);
    } else {
      MemoriesHelper.adjustMemory(data, timePeriods, memories);
    }
  }

  private static determineMemoriesForStocks(
    filterVars: IAllFilterData,
    uniqueStockNames: IAllStockNames,
  ): IAllMemory {
    return MemoriesHelper.initMemories(filterVars, uniqueStockNames);
  }

  private static assignStockNames(
    symbols: string[],
    timePeriods: PeriodType[],
    uniqueStockNames: IAllStockNames,
  ): IAllStockNames {
    if (Object.keys(uniqueStockNames).length === 0) {
      for (const value of CONSTANTS.PERIODS) {
        uniqueStockNames[value] = [];
      }
    }
    timePeriods.forEach((period) => {
      uniqueStockNames[period].push(...symbols);
      uniqueStockNames[period] = this.filterForDupsAndTrim(
        uniqueStockNames[period],
      );
    });
    return uniqueStockNames;
  }

  private static filterForDupsAndTrim(arr: string[]): string[] {
    return [...new Set(arr.map((item) => item.trim()))];
  }
}
