import { BackTestHelper } from "../back-testing/back-test-helper";
import { BackTestService } from "./back-test-service";
import { DataHandler } from "./data-handler";
import { ITestConfig } from "../types/back-test-types";
import {
  IInitializedJobData,
  IJob,
  IStockScreenerJob,
} from "../types/data-processing-types";
import { IStockGroup } from "../types/entity-types";
import { CONSTANTS, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";

export class HistoricalWarmupService {
  static async warmInitializedSlice(
    jobs: IStockScreenerJob[],
    group: IStockGroup,
    slice: IInitializedJobData,
    endTime = Date.now(),
  ): Promise<IInitializedJobData> {
    console.log('preparing to warm up slice with historical data');
    const periods = CONSTANTS.PERIODS.filter(
      (period) => period >= PeriodType.DAY && (slice.newNames[period]?.length ?? 0) > 0,
    );
    if (!periods.length) {
      return slice;
    }

    const maxSpace = this.getMaxSpace(slice.newMemories, periods);
    if (maxSpace <= 1) {
      return slice;
    }

    const calendarDays = Math.ceil((maxSpace * 7) / 5) + 5;
    const warmupEndTime = this.getWarmupEndTime(endTime);
    const startTime = warmupEndTime - calendarDays * CONSTANTS.MILLIS_IN_DAY;
    const helper = new BackTestHelper();
    const symbols = this.collectSymbols(slice, periods);
    const config: ITestConfig = {
      startTime,
      endTime: warmupEndTime,
      minimumPeriod: PeriodType.DAY,
    };

    await helper.initCandleData(config, periods, symbols);

    const replayJob: IJob = {
      run: (time: number) => {
        this.replayDataAtTime(helper, jobs, slice, periods, time);
      },
      clearIntradayStateData: () => {},
    };

    BackTestService.iterateThroughCandlesAndRun(replayJob, config);
    console.log('finished warming up slice with historical data');
    return slice;
  }

  private static getMaxSpace(
    memories: IInitializedJobData["newMemories"],
    periods: PeriodType[],
  ) {
    let maxSpace = 0;
    periods.forEach((period) => {
      const periodMemories = memories[period] || {};
      Object.values(periodMemories).forEach((symbols) => {
        Object.values(symbols || {}).forEach((memory) => {
          maxSpace = Math.max(maxSpace, period > PeriodType.DAY ? memory.space * 7 : memory.space);
        });
      });
    });
    return maxSpace;
  }

  private static collectSymbols(
    slice: IInitializedJobData,
    periods: PeriodType[],
  ) {
    return [...new Set(periods.flatMap((period) => slice.newNames[period] || []))];
  }

  private static getWarmupEndTime(endTime: number) {
    const aligned = StockTradeUtil.getEastCoastDate(new Date(endTime));
    aligned.setHours(15, 59, 0, 0);
    aligned.setDate(aligned.getDate() - 1);

    // Step back over weekends so the endpoint is always a trading weekday.
    while (aligned.getDay() === 0 || aligned.getDay() === 6) {
      aligned.setDate(aligned.getDate() - 1);
    }

    return aligned.getTime();
  }

  private static replayDataAtTime(
    helper: BackTestHelper,
    jobs: IStockScreenerJob[],
    slice: IInitializedJobData,
    periods: PeriodType[],
    time: number,
  ) {
    const minutesSinceStart =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) -
      CONSTANTS.BEGIN_TIME;
    const timePeriodsToScreen = periods.filter(
      (period) =>
        (period === PeriodType.DAY &&
          minutesSinceStart ===
            CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME) ||
        (period < PeriodType.DAY && minutesSinceStart % period === 0),
    );

    if (!timePeriodsToScreen.length) {
      return;
    }

    const data = helper.getTestData(time, timePeriodsToScreen, minutesSinceStart);
    const hasAnyData = timePeriodsToScreen.some((period) => (data[period]?.length ?? 0) > 0);
    if (!hasAnyData) {
      return;
    }

    DataHandler.adjustMemory(
      slice.newMemories,
      data,
      timePeriodsToScreen,
      slice.newFilterData,
    );
    DataHandler.processDataBackTest(
      data,
      jobs,
      time,
      timePeriodsToScreen,
      slice.newFilterData,
      slice.newMemories,
    );
  }
}