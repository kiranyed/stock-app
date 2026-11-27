import { BackTestHelper } from "../back-testing/back-test-helper";
import { BackTestService } from "./back-test-service";
import { ITestConfig } from "../types/back-test-types";
import { IJob, IStockScreenerJob } from "../types/data-processing-types";
import { IStockGroup } from "../types/entity-types";
import { CONSTANTS, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { BarInput, IndicatorEngine } from "../engine/engine";
import { candleToBar, duePeriods } from "../engine/bars";

const SESSION_MINUTES = CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME;

/**
 * Builds an engine with the indicators `jobs` need for `group`, and replays
 * enough history through it (the same backtest feed, every period, intraday
 * included) for each indicator to be valid. LiveMasterJob.addJobs copies the
 * resulting state into its own indicators.
 */
export class HistoricalWarmupService {
  static async warm(
    jobs: IStockScreenerJob[],
    group: IStockGroup,
    endTime = Date.now(),
  ): Promise<IndicatorEngine> {
    const engine = new IndicatorEngine();
    for (const job of jobs) {
      for (const symbol of group.symbols) {
        engine.add(symbol.trim(), { kind: "price" }, job.getPeriod());
        for (const { spec } of job.getVariables()) {
          if (spec) engine.add(symbol.trim(), spec, job.getPeriod());
        }
      }
    }

    const periods = engine.periods();
    const tradingDays = Math.max(
      ...periods.map((p) => this.tradingDaysFor(p, engine.warmupBars(p))),
    );
    if (!periods.length || tradingDays <= 0) {
      return engine;
    }

    // calendar days, with slack for weekends and holidays
    const calendarDays = Math.ceil(tradingDays * 1.5) + 5;
    const config: ITestConfig = {
      startTime: endTime - calendarDays * CONSTANTS.MILLIS_IN_DAY,
      endTime: endTime - (endTime % CONSTANTS.MILLIS_IN_MINUTE) - CONSTANTS.MILLIS_IN_MINUTE,
      minimumPeriod: periods[0],
    };
    console.log(`warming up ${periods.join(", ")}-minute indicators over ${tradingDays} trading days`);

    const helper = new BackTestHelper();
    await helper.initCandleData(config, periods, [...new Set(group.symbols.map((s) => s.trim()))]);

    const replay: IJob = {
      run: (time: number) => {
        const due = duePeriods(time, periods);
        if (!due.length) return;
        const minutesSinceStart =
          StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) - CONSTANTS.BEGIN_TIME;
        const data = helper.getTestData(time, due, minutesSinceStart);
        const bars: Partial<Record<PeriodType, BarInput[]>> = {};
        for (const p of due) bars[p] = (data[p] ?? []).map(candleToBar);
        engine.onBars(time, bars);
      },
    };
    BackTestService.iterateThroughCandlesAndRun(replay, config);
    console.log("finished warming up indicators");
    return engine;
  }

  /** Trading days of history that hold `bars` bars of `period`, plus one. */
  static tradingDaysFor(period: PeriodType, bars: number): number {
    if (bars <= 1) return 0;
    const perDay = period >= PeriodType.DAY ? 1 : Math.floor(SESSION_MINUTES / period);
    return Math.ceil(bars / perDay) + 1;
  }
}
