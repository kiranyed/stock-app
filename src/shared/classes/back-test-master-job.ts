import { AnalysisBackTest } from "../../analysis/analysis-back-test";
import { BackTestHelper } from "../../back-testing/back-test-helper";
import { DataHandler } from "../../run/data-handler";
import { ITestConfig } from "../../types/back-test-types";
import {
  IBackTestScreenerJob,
  IStockData,
  IStockDataBackTest,
  IStockScreenerJob,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { CONSTANTS, PeriodType } from "../constants";
import { StockTradeUtil } from "../utilities/stock-trade";
import { StrategyUtil } from "../utilities/strategy-util";

import MasterJob from "./master-job";

export class BackTestMasterJob extends MasterJob {
  private backTestHelper = new BackTestHelper();

  private testConfig: ITestConfig;
  jobs: IBackTestScreenerJob[] = new Array<IBackTestScreenerJob>();
  closeTime = 960;
  constructor(
    jobs: IBackTestScreenerJob[],
    group: IStockGroup,
    testConfig: ITestConfig,
  ) {
    super(jobs, group);
    this.jobs = jobs;
    this.testConfig = testConfig;
  }

  getNewInitializedData(newJobs: IStockScreenerJob[]) {
    return DataHandler.initializeData(newJobs, this.group, this.allNames);
  }

  prepare(newJobs: IStockScreenerJob[]) {
    const [allNames, allFilterData, allMemories] =
      this.getNewInitializedData(newJobs);
    // in live-master-job, iterate through and add all the new ones
    this.allNames = allNames;
    this.allVars = allFilterData;
    this.allMemories = allMemories;
  }

  async prepareJobs() {
    await this.backTestHelper.initCandleData(
      this.testConfig,
      StrategyUtil.getAllTimePeriods(this.jobs),
      this.group.symbols,
    );
    if (this.testConfig.analyze) {
      //TODO hacky, need to fix
      this.jobs.forEach((job) =>
        (job as AnalysisBackTest).setBackTestHelper(this.backTestHelper),
      );
    }
  }

  run(time: number, eastCoastOffset: number) {
    void eastCoastOffset;
    const timePeriods = StrategyUtil.getAllTimePeriods(this.jobs);

    const minutesSinceStart =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) -
      CONSTANTS.BEGIN_TIME;
    const timePeriodsToScreen = timePeriods.filter(
      (period) => period < PeriodType.DAY && minutesSinceStart % period === 0,
    );
    if (
      (timePeriods.length === 1 && timePeriods.includes(PeriodType.DAY)) ||
      minutesSinceStart ===
        CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME
    ) {
      timePeriodsToScreen.push(PeriodType.DAY);
    }

    const data = this.backTestHelper.getTestData(
      time,
      timePeriodsToScreen,
      minutesSinceStart,
    );

    //DataHandler.adjustMemoryBackTest(this.allMemories, data, timePeriodsToScreen, this.allVars);

    const dataMap: { [symbol: string]: IStockData } = {};
    for (const period of timePeriodsToScreen) {
      const arr = data[period];
      if (arr) {
        for (const item of arr) {
          // no matter what candle (1m vs 5m etc), their open price is all
          // the same.  when i called getTestData, I set the open price
          // to the property called 'tradePrice', so we can use that
          if (!dataMap[item.symbol] && item.tradePrice) {
            dataMap[item.symbol] = {
              volume: item.volume,
              tradePrice: item.tradePrice,
              datetime: time,
              price: item.price,
              symbol: item.symbol,
            };
          }
        }
      }
    }
    if (Object.keys(dataMap).length === 0) {
      return;
    }
    const dataArr: IStockData[] = [];

    for (const symbol of Object.keys(dataMap)) {
      dataArr.push(dataMap[symbol]);
    }

    /* 
         which one should go first?

         I think adjustMemory should go first.  what if there's a lapse in data -- meaning,
         for whatever reason, the interval is 1 minute, and the last time the memory was updated
         was 4 minutes ago,  that means that if we called processData and the variable was percent change
         in the last 2 minutes, it would take the current price and divide by memories[PeriodType.MINUTE]['price][symbol].list[length - 2],
         which would in fact be the price from 5 minutes ago.

        */
    DataHandler.adjustMemory(
      this.allMemories,
      data,
      timePeriodsToScreen,
      this.allVars,
    );
    DataHandler.processDataBackTest(
      data,
      this.jobs,
      time,
      timePeriodsToScreen,
      this.allVars,
      this.allMemories,
      this.allHistograms,
    );

    this.finishJob(dataArr);
  }

  getAllTestResults() {
    // use below  at some point
    //return this.jobs.map(job => ({id: job.getConfigId(), results: job.getTestResults() })) ;
    return this.jobs.map((job) => job.getTestResults());
  }

  handleNewData(data: IStockDataBackTest[]) {
    if (!data.length) {
      throw new Error("handleNewData called with no data");
    }
    const time = data[0].datetime;
    const timePeriods = StrategyUtil.getAllTimePeriods(this.jobs);
    const minutesSinceStart =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) -
      CONSTANTS.BEGIN_TIME;

    // need to add logic that if the time is 3:55, then add the day or week periods

    const timePeriodsToScreen =
      minutesSinceStart < CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME
        ? timePeriods.filter(
            (period) =>
              period < PeriodType.DAY && minutesSinceStart % period === 0,
          )
        : [];

    if (
      (timePeriods.length === 1 && timePeriods.includes(PeriodType.DAY)) ||
      minutesSinceStart === CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME
    ) {
      timePeriodsToScreen.push(PeriodType.DAY);
    }
    // const dayPeriods = timePeriodsToScreen.filter(period => period >= PeriodType.DAY);
    // const intraDayPeriods = timePeriodsToScreen.filter(period => period < PeriodType.DAY);

    //for day periods, we are mimicking making the trade at 3:55 pm, whereas
    // with intraday, we are making the trade at the start of the next period, using
    // next period's candle open

    DataHandler.processData(
      data,
      this.jobs,
      time,
      timePeriodsToScreen,
      this.allVars,
      this.allMemories,
      this.allHistograms,
    );
  }
}
