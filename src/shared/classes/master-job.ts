import { CONSTANTS, PeriodType, MemoryType } from "../constants";
import { DataHandler } from "../../run/data-handler";
import {
  IAllFilterData,
  IAllHistograms,
  IAllMemory,
  IAllStockNames,
  IJob,
  IStockData,
  IStockScreenerJob,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { StockTradeUtil } from "../utilities/stock-trade";
import {
  initFilterData,
  initMemories,
  initStockNames,
} from "../utilities/run-util";
import {
  VariableMatchers,
  VariableParsers,
} from "../utilities/variable-patterns";
import { buildHistogram } from "../utilities/variable-calculations";

export default abstract class MasterJob implements IJob {
  jobs: IStockScreenerJob[];
  protected allNames: IAllStockNames = initStockNames();
  protected allVars: IAllFilterData = initFilterData();
  protected allMemories: IAllMemory = initMemories();
  protected allHistograms: IAllHistograms = {};
  group: IStockGroup;
  pausedJobs: IStockScreenerJob[] = [];

  constructor(jobs: IStockScreenerJob[], group: IStockGroup) {
    this.jobs = jobs;
    this.group = {
      ...group,
      symbols: group.symbols.map((symbol) => symbol.trim()),
    };
  }

  getNewInitializedData(newJobs: IStockScreenerJob[]) {
    return DataHandler.initializeData(newJobs, this.group, this.allNames);
  }

  abstract prepare(newJobs: IStockScreenerJob[]): void;

  abstract run(time: number, offset?: number): void;

  abstract handleNewData(data: IStockData[]): void;

  clearIntradayStateData(): void {
    for (const period of CONSTANTS.PERIODS) {
      if (period >= PeriodType.DAY) {
        continue;
      }
      const vars = this.allVars[period];
      const memories = this.allMemories[period];
      for (const variable of Object.keys(vars)) {
        const filterData = vars[variable];
        for (const stockName of Object.keys(filterData)) {
          filterData[stockName] = NaN;
        }
      }

      for (const memoryType of Object.keys(memories)) {
        const memory = memories[memoryType];
        for (const stockName of Object.keys(memory)) {
          memory[stockName] = {
            space: memory[stockName].space,
            list: [],
            lastTime: 0,
          };
        }
      }
    }
  }

  runDailyMaintenance(): void {
    const sessionMinutes = CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME;
    for (const period of CONSTANTS.PERIODS) {
      if (period >= PeriodType.DAY) continue;
      const vars = this.allVars[period];
      const memories = this.allMemories[period];
      if (!vars || !memories) continue;

      for (const key of Object.keys(vars)) {
        if (!VariableMatchers.isPricePercentChangePercentile(key)) continue;
        const parsed = VariableParsers.parsePricePercentChangePercentile(key);
        if (!parsed) continue;

        const { period: percentChangePeriod, sessions } = parsed;
        const safeSessions = Math.max(1, Math.floor(sessions));
        const barsPerSession = Math.max(1, Math.ceil(sessionMinutes / period));
        const rollingBars = Math.min(
          5000,
          Math.max(300, safeSessions * barsPerSession),
        );

        this.allHistograms[period] ||= {};
        (this.allHistograms[period] as Record<string, Record<string, unknown>>)[key] ||= {};
        const keyHistograms = this.allHistograms[period]![key];

        const priceMemories = memories[MemoryType.PRICE];
        if (!priceMemories) continue;

        for (const symbol of Object.keys(priceMemories)) {
          const priceHistory = priceMemories[symbol]?.list ?? [];
          const historicalChanges: number[] = [];
          const start = Math.max(
            percentChangePeriod,
            priceHistory.length - (rollingBars + percentChangePeriod),
          );
          for (let i = start; i < priceHistory.length; i++) {
            const cur = priceHistory[i];
            const prev = priceHistory[i - percentChangePeriod];
            if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0) {
              historicalChanges.push((cur / prev - 1) * 100);
            }
          }
          keyHistograms[symbol] = buildHistogram(historicalChanges);
        }
      }
    }
  }

  finishJob(data: IStockData[]) {
    if (!data || data.length === 0) {
      return;
    }
    const time = data[0].datetime;
    const minutesSinceStart =
      StockTradeUtil.getMinutesInDay(
        StockTradeUtil.getEastCoastDate(new Date(time)),
      ) - CONSTANTS.BEGIN_TIME;
    //this.handleNewData(data);
    // DataHandler.adjustMemory(this.allMemories, data, timePeriodsToScreen);
    // DataHandler.processData(data, this.jobs, time, timePeriodsToScreen, this.allVars, this.allMemories);

    this.jobs.forEach(
      (job) => job.canRun(minutesSinceStart) && job.run(time, data),
    );
  }
}
