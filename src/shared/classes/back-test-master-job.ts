import { AnalysisBackTest } from "../../analysis/analysis-back-test";
import { BackTestHelper } from "../../back-testing/back-test-helper";
import { ITestConfig } from "../../types/back-test-types";
import {
  IBackTestScreenerJob,
  IStockData,
  IStockDataBackTest,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { CONSTANTS, PeriodType } from "../constants";
import { StockTradeUtil } from "../utilities/stock-trade";
import { BarInput } from "../../engine/engine";
import { candleToBar, duePeriods } from "../../engine/bars";

import MasterJob from "./master-job";

export class BackTestMasterJob extends MasterJob {
  private backTestHelper = new BackTestHelper();

  private testConfig: ITestConfig;
  jobs: IBackTestScreenerJob[] = new Array<IBackTestScreenerJob>();
  constructor(
    jobs: IBackTestScreenerJob[],
    group: IStockGroup,
    testConfig: ITestConfig,
  ) {
    super(jobs, group);
    this.jobs = jobs;
    this.testConfig = testConfig;
  }

  async prepareJobs() {
    await this.backTestHelper.initCandleData(
      this.testConfig,
      this.periods(),
      this.group.symbols,
    );
    if (this.testConfig.analyze) {
      //TODO hacky, need to fix
      this.jobs.forEach((job) =>
        (job as unknown as AnalysisBackTest).setBackTestHelper(this.backTestHelper),
      );
    }
  }

  run(time: number) {
    const due = duePeriods(time, this.periods());
    if (!due.length) return;

    const minutesSinceStart =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(time)) -
      CONSTANTS.BEGIN_TIME;
    const data = this.backTestHelper.getTestData(time, due, minutesSinceStart);

    const bars: Partial<Record<PeriodType, BarInput[]>> = {};
    for (const period of due) {
      bars[period] = (data[period] ?? []).map(candleToBar);
    }
    this.engine.onBars(time, bars);

    for (const job of this.dueJobs(time)) {
      const symbols = this.symbolsOf(job);
      const own: IStockData[] = (data[job.getPeriod()] ?? [])
        .filter((c: IStockDataBackTest) => symbols.has(c.symbol))
        .map((c) => ({
          symbol: c.symbol,
          price: c.price,
          // intraday trades fill at the next bar's open, DAY at the close
          tradePrice: c.tradePrice,
          volume: c.volume,
          datetime: time,
        }));
      this.publish(job);
      if (own.length) job.run(time, own);
    }
  }

  getAllTestResults() {
    return this.jobs.map((job) => job.getTestResults());
  }
}
