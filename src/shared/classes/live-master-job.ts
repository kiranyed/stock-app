import {
  ILiveStockScreenerJob,
  IAllStockNames,
  IStockScreenerJob,
  IAllMemory,
  IInitializedJobData,
  IStockData,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { TradeLogger } from "../utilities/trade-logger";
import MasterJob from "./master-job";
import { DataRetriever } from "../../run/data-retriever";
import { CONSTANTS, PeriodType } from "../constants";
import { StockTradeUtil } from "../utilities/stock-trade";
import { StrategyUtil } from "../utilities/strategy-util";
import { initMemories } from "../utilities/run-util";
import { DataHandler } from "../../run/data-handler";
import { SchwabAPI } from "../services/trading-api";

export class LiveMasterJob extends MasterJob {
  jobs: ILiveStockScreenerJob[] = new Array<ILiveStockScreenerJob>();
  pausedJobs: ILiveStockScreenerJob[] = new Array<ILiveStockScreenerJob>();
  protected allMemories: IAllMemory = initMemories();

  constructor(jobs: ILiveStockScreenerJob[], group: IStockGroup) {
    super(jobs, group);
    this.jobs = jobs;
  }

  isInitialized() {
    return this.jobs.length > 0;
  }

  private buildInitializedSlice(newJobs: IStockScreenerJob[]): IInitializedJobData {
    const [newNames, newFilterData, newMemories] =
      this.getNewInitializedData(newJobs);

    return {
      newNames,
      newFilterData,
      newMemories,
    };
  }

  private expandMemorySpace(
    period: PeriodType,
    memoryType: string,
    symbol: string,
    nextMemory: { space: number; list: number[]; lastTime: number },
  ) {
    const currentMemory = this.allMemories[period][memoryType][symbol];
    if (!currentMemory || nextMemory.space <= currentMemory.space) {
      return;
    }

    const additionalSpace = nextMemory.space - currentMemory.space;
    currentMemory.space = nextMemory.space;
    currentMemory.list = [
      ...new Array<number>(additionalSpace).fill(NaN),
      ...currentMemory.list,
    ];
  }

  mergeInitializedSlice({
    newNames,
    newFilterData,
    newMemories,
  }: IInitializedJobData) {

    CONSTANTS.PERIODS.forEach((period) => {
      if (newNames[period]) {
        newNames[period].forEach((name) => {
          if (this.allNames[period]) {
            if (!this.allNames[period].includes(name)) {
              this.allNames[period].push(name);
            }
          }
        });
      }

      // Merge filter data
      if (!this.allVars[period]) {
        this.allVars[period] = {};
      }
      Object.keys(newFilterData[period] || {}).forEach((symbol) => {
        if (this.allVars[period]) {
          if (!this.allVars[period][symbol]) {
            if (newFilterData[period]) {
              this.allVars[period][symbol] = newFilterData[period][symbol];
            }
          }
        }
      });


      // Merge memories
      for (const memoryType of Object.keys(newMemories[period] || {})) {
        for (const symbol of Object.keys(newMemories[period][memoryType])) {
          const nextMemory = newMemories[period][memoryType][symbol];

          if (!this.allMemories[period][memoryType]) {
            this.allMemories[period][memoryType] = newMemories[period][memoryType];
            continue;
          }

          if (!this.allMemories[period][memoryType][symbol]) {
            this.allMemories[period][memoryType][symbol] = nextMemory;
            continue;
          }

          this.expandMemorySpace(period, memoryType, symbol, nextMemory);
        }
      }
    });
  }

  prepare(newJobs: IStockScreenerJob[]) {
    return this.buildInitializedSlice(newJobs);
  }

  handleNewData(data: IStockData[]): void {
    const time = data[0].datetime;
    const timePeriods = StrategyUtil.getAllTimePeriods(this.jobs);
    const minutesSinceStart =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) -
      CONSTANTS.BEGIN_TIME;
    const timePeriodsToScreen = timePeriods.filter(
      (period) => minutesSinceStart % period === 0,
    );
    DataHandler.adjustMemory(this.allMemories, data, timePeriodsToScreen);
    DataHandler.processData(
      data,
      this.jobs,
      data[0].datetime,
      timePeriodsToScreen,
      this.allVars,
      this.allMemories,
      this.allHistograms,
    );
  }

  addJobs(jobs: ILiveStockScreenerJob[]) {
    this.jobs.push(...jobs);
  }

  getData(periods: PeriodType[], names: IAllStockNames) {
    return DataRetriever.getData(periods, names);
  }

  async run() {
    await SchwabAPI.testAccessToken();
    const time = Date.now();
    const eastCoastMinute = StockTradeUtil.getMinutesInDayEastCoast(
      new Date(time),
    );
    const timePeriods = StrategyUtil.getAllTimePeriods(this.jobs);
    const minutesSinceStart =
      eastCoastMinute - CONSTANTS.BEGIN_TIME;
    const timePeriodsToScreen = timePeriods.filter(
      (period) => period < PeriodType.DAY && minutesSinceStart % period === 0,
    );

    console.debug("[LiveMasterJob] run tick", {
      isoTime: new Date(time).toISOString(),
      eastCoastMinute,
      minutesSinceStart,
      totalJobs: this.jobs.length,
      configuredPeriods: timePeriods,
      intradayPeriodsToScreen: timePeriodsToScreen,
    });

    // check if time = 3:59
    if (
      timePeriods.includes(PeriodType.DAY) &&
      eastCoastMinute === CONSTANTS.DAY_PERIOD_TRADE_TIME
    ) {
      timePeriodsToScreen.push(PeriodType.DAY);
      console.debug("[LiveMasterJob] day period trigger matched", {
        isoTime: new Date(time).toISOString(),
        eastCoastMinute,
        dayTradeTime: CONSTANTS.DAY_PERIOD_TRADE_TIME,
      });
    }

    console.debug("[LiveMasterJob] periods selected", {
      isoTime: new Date(time).toISOString(),
      timePeriodsToScreen,
    });

    if (timePeriodsToScreen.length === 0) {
      console.debug("[LiveMasterJob] skipping run; no periods selected", {
        isoTime: new Date(time).toISOString(),
      });
      return;
    }

    console.debug("[LiveMasterJob] retrieving data", {
      isoTime: new Date(time).toISOString(),
      periods: timePeriodsToScreen,
    });

    const data = await this.getData(timePeriodsToScreen, this.allNames);

    console.debug("[LiveMasterJob] data retrieval completed", {
      isoTime: new Date(time).toISOString(),
      records: data?.length ?? 0,
    });

    if (!data || data.length === 0) {
      console.log('no data retrieved for time ' + new Date(time).toString());
      return;
    }

    console.debug("[LiveMasterJob] processing data", {
      isoTime: new Date(time).toISOString(),
      records: data.length,
    });

    this.handleNewData(data);
    this.finishJob(data);

    console.debug("[LiveMasterJob] run completed", {
      isoTime: new Date(time).toISOString(),
      records: data.length,
    });
  }

  pause(id: number) {
    for (let i = 0; i < this.jobs.length; i++) {
      if (id === this.jobs[i].getId()) {
        TradeLogger.logToStrategy(
          `paused run id ${this.jobs[i].getId()}`,
          `job id: ${this.jobs[i].getId().toString()}`,
        );
        this.pausedJobs.push(this.jobs.splice(i, 1)[0]);
        return;
      }
    }
  }

  resume(id: number) {
    for (let i = 0; i < this.pausedJobs.length; i++) {
      if (id === this.pausedJobs[i].getId()) {
        TradeLogger.log(`resumed run id ${id}`);
        this.jobs.push(this.pausedJobs.splice(i, 1)[0]);
        return;
      }
    }
  }

  end(id: number) {
    for (let i = 0; i < this.jobs.length; i++) {
      const run = this.jobs[i];
      if (run.getId() === id) {
        TradeLogger.log(`ended run id ${id}`);
        TradeLogger.renameStrategyLog(`Run${run.getId()}`);
        this.jobs.splice(i, 1);
        return;
      }
    }

    for (let i = 0; i < this.pausedJobs.length; i++) {
      const run = this.pausedJobs[i];
      if (run.getId() === id) {
        TradeLogger.log(`ended run id ${id}`);
        TradeLogger.renameStrategyLog(`Run${run.getId()}`);
        this.pausedJobs.splice(i, 1);
        return;
      }
    }
  }

  endAll() {
    const allStrats = [...this.jobs, ...this.pausedJobs];
    allStrats.forEach((run) => {
      TradeLogger.renameStrategyLog(`Run${run.getId()}`);
    });
    TradeLogger.log(`ended all strategies`);

    this.jobs = [];
    this.pausedJobs = [];
  }
}
