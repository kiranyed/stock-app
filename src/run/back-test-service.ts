import { BEGIN_TIME, CONSTANTS, PeriodType } from "../shared/constants";
import { BackTestMasterJob } from "../shared/classes/back-test-master-job";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { ITestConfig } from "../types/back-test-types";
import { IBackTestScreenerJob, IJob } from "../types/data-processing-types";
import { IStockGroup } from "../types/entity-types";
import { StrategyUtil } from "../shared/utilities/strategy-util";

enum DAY {
  SUNDAY,
  MONDAY,
  TUESDAY,
  WEDNESDAY,
  THURSDAY,
  FRIDAY,
  SATURDAY,
}

export class BackTestService {
  static async runBackTests(
    tests: IBackTestScreenerJob[],
    group: IStockGroup,
    config: ITestConfig,
  ) {
    const masterJob = new BackTestMasterJob(tests, group, config);
    masterJob.prepare(tests);
    await masterJob.prepareJobs();
    const periods = StrategyUtil.getAllTimePeriods(tests);

    const minPeriod = Math.min(...periods);
    config.minimumPeriod = minPeriod;

    this.iterateThroughCandlesAndRun(masterJob, config);

    // return an object of type ITestResults and have both back test and
    // analysis back test return it
    return masterJob.getAllTestResults();
  }

  static iterateThroughCandlesAndRun(job: IJob, config: ITestConfig) {
    const { startTime, endTime } = config;
    // Normalize startTime to zero out seconds and milliseconds
    const normalizedStartTime = startTime - (startTime % 60000);
    const dayPeriodTradeTime = CONSTANTS.DAY_PERIOD_TRADE_TIME;
    const { MILLIS_IN_MINUTE } = CONSTANTS;
    let realStartTime =
      normalizedStartTime +
      this.getTimeUntilNextTradingTime(normalizedStartTime);
    let currentTime = realStartTime;
    const minimumPeriod = config.minimumPeriod
      ? config.minimumPeriod
      : PeriodType.MINUTE;
    if (minimumPeriod === PeriodType.DAY) {
      realStartTime +=
        MILLIS_IN_MINUTE *
        (CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME);
      currentTime = realStartTime;
    }
    const incrementTime = minimumPeriod * MILLIS_IN_MINUTE;
    let eastCoastOffset = StockTradeUtil.computeOffset(currentTime);
    while (currentTime <= endTime) {
      while (
        currentTime <= endTime &&
        this.inTradingTime(currentTime, eastCoastOffset)
      ) {
        const minsInDay =
          StockTradeUtil.getMinutesInDay(new Date(currentTime)) +
          eastCoastOffset;
        const nextTimeInMins = minsInDay + minimumPeriod;
        job.run(currentTime, eastCoastOffset);

        // if the nextTimeInMins is greater than or equal to 4:00, that means ths current time is the last time the job runs
        // for the current day
        if (
          minsInDay < dayPeriodTradeTime &&
          nextTimeInMins >= CONSTANTS.END_TIME
        ) {
          const timeUntilDayPeriodTradeTimeInMillis =
            (dayPeriodTradeTime - minsInDay) * MILLIS_IN_MINUTE;
          currentTime += timeUntilDayPeriodTradeTimeInMillis;
          job.run(currentTime, eastCoastOffset);
        }
        currentTime += incrementTime;
      }

      // if (incrementTime < PeriodType.DAY) {
      //     job.run(currentTime, eastCoastOffset);
      // }
      if (currentTime > endTime) {
        break;
      }
      if (job.clearIntradayStateData) {
        job.clearIntradayStateData();
      }
      if (job.runDailyMaintenance) {
        job.runDailyMaintenance();
      }

      currentTime += this.getTimeUntilNextTradingTime(currentTime);
      let currentDate = StockTradeUtil.getEastCoastDate(new Date(currentTime));
      eastCoastOffset = StockTradeUtil.computeOffset(currentTime);
      if (currentDate.getHours() === 8) {
        currentTime += CONSTANTS.MILLIS_IN_HOUR;
        currentDate = StockTradeUtil.getEastCoastDate(new Date(currentTime));
      } else if (currentDate.getHours() === 10) {
        currentTime -= CONSTANTS.MILLIS_IN_HOUR;
        currentDate = StockTradeUtil.getEastCoastDate(new Date(currentTime));
      }
      if (minimumPeriod === PeriodType.DAY) {
        currentTime +=
          MILLIS_IN_MINUTE *
          (CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME);
      }
      if (
        currentDate.getHours() * CONSTANTS.MINS_IN_HOUR +
          currentDate.getMinutes() !==
        BEGIN_TIME
      ) {
        throw new Error("Time is not at the beginning of the trading day");
      }
    }
  }

  private static inTradingTime(currentTime: number, offset: number) {
    const currentDate = new Date(currentTime);
    const todaysMinutes = StockTradeUtil.getMinutesInDay(currentDate);
    const retVal =
      (currentDate.getDay() + 1) % 7 > 1 &&
      todaysMinutes + offset >= 570 &&
      todaysMinutes + offset < 960;
    return retVal;
  }

  private static getTimeUntilNextTradingTime(currentTime: number) {
    let time = 0;
    const currentDate = StockTradeUtil.getEastCoastDate(new Date(currentTime));
    const curDay = currentDate.getDay();
    const mins = StockTradeUtil.getMinutesInDay(currentDate);
    const { MINS_IN_DAY, BEGIN_TIME, END_TIME, MILLIS_IN_MINUTE } = CONSTANTS;
    if (curDay === DAY.SUNDAY) {
      if (mins < BEGIN_TIME) {
        time = MINS_IN_DAY + (BEGIN_TIME - mins);
      } else {
        time = MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    } else if (curDay === DAY.SATURDAY) {
      if (mins < BEGIN_TIME) {
        time = 2 * MINS_IN_DAY + (BEGIN_TIME - mins);
      } else {
        time = 2 * MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    } else if (curDay === DAY.FRIDAY && mins >= END_TIME) {
      if (mins >= END_TIME) {
        time = MINS_IN_DAY - (mins - BEGIN_TIME) + 2 * MINS_IN_DAY;
      }
    } else {
      if (mins < BEGIN_TIME) {
        time = BEGIN_TIME - mins;
      } else if (mins >= END_TIME) {
        time = MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    }
    return time * MILLIS_IN_MINUTE;
  }
}
