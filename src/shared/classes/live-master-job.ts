import {
  ILiveStockScreenerJob,
  IStockScreenerJob,
  IAllStockNames,
  IStockData,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { TradeLogger } from "../utilities/trade-logger";
import MasterJob from "./master-job";
import { DataRetriever } from "../../run/data-retriever";
import { CONSTANTS, PeriodType } from "../constants";
import { StockTradeUtil } from "../utilities/stock-trade";
import { BarInput, IndicatorEngine } from "../../engine/engine";
import { QuoteBars, duePeriods } from "../../engine/bars";

export class LiveMasterJob extends MasterJob {
  jobs: ILiveStockScreenerJob[] = new Array<ILiveStockScreenerJob>();
  pausedJobs: ILiveStockScreenerJob[] = new Array<ILiveStockScreenerJob>();
  private quoteBars = new QuoteBars();
  /** Jobs whose async run (real money) hasn't settled yet. */
  private inFlight = new Set<IStockScreenerJob>();

  constructor(jobs: ILiveStockScreenerJob[], group: IStockGroup) {
    super(jobs, group);
    this.jobs = jobs;
  }

  isInitialized() {
    return this.jobs.length + this.pausedJobs.length > 0;
  }

  /**
   * Start running `jobs` on `group`'s symbols, and hold `paused` until they're resumed.
   * Indicators they add start from `warmed` (an engine HistoricalWarmupService replayed
   * history through); indicators already running live keep their state.
   */
  addJobs(
    jobs: ILiveStockScreenerJob[],
    group: IStockGroup,
    warmed?: IndicatorEngine,
    paused: ILiveStockScreenerJob[] = [],
  ) {
    const created = this.register([...jobs, ...paused], group.symbols);
    if (warmed) this.engine.copyStateFrom(warmed, created);
    this.jobs.push(...jobs);
    this.pausedJobs.push(...paused);
  }

  /** Feed one set of quote snapshots (all taken at the same minute) to the engine. */
  handleNewData(data: IStockData[]): void {
    const time = data[0].datetime;
    const bars: Partial<Record<PeriodType, BarInput[]>> = {};
    for (const period of duePeriods(time, this.periods())) {
      bars[period] = this.quoteBars.toBars(period, data, new Set(this.symbolsFor(period)));
    }
    this.engine.onBars(time, bars);
    for (const job of this.dueJobs(time)) this.publish(job);
  }

  getData(periods: PeriodType[], names: Partial<IAllStockNames>) {
    return DataRetriever.getData(periods, names);
  }

  /**
   * One minute's tick. `time` is the start of the minute; quotes are stamped with it, so a bar
   * gets the same time as in a back test however long the fetch takes.
   */
  async run(time?: number) {
    if (time === undefined) {
      const now = Date.now();
      time = now - (now % CONSTANTS.MILLIS_IN_MINUTE);
    }
    const due = duePeriods(time, this.periods());

    console.debug("[LiveMasterJob] run tick", {
      isoTime: new Date(time).toISOString(),
      eastCoastMinute: StockTradeUtil.getMinutesInDayEastCoast(new Date(time)),
      totalJobs: this.jobs.length,
      periods: this.periods(),
      due,
    });

    if (due.length === 0) {
      return;
    }

    const names: Partial<IAllStockNames> = {};
    for (const period of due) names[period] = this.symbolsFor(period);
    if (!due.some((period) => names[period]?.length)) return;
    const fetched = await this.getData(due, names);

    if (!fetched || fetched.length === 0) {
      // a failed tick, so the scheduler counts it
      throw new Error(`no quotes for ${due.join(", ")}-minute bars at ${new Date(time).toISOString()}`);
    }
    const data = fetched.map((d) => ({ ...d, datetime: time }));

    this.handleNewData(data);
    this.finishJob(data);
  }

  /**
   * One strategy's error is logged and doesn't stop the others (PRODUCTION-READINESS.md §2.5).
   * An asynchronous job whose previous tick hasn't finished skips this one rather than running
   * twice at once (§2.6).
   */
  protected runJob(job: IStockScreenerJob, time: number, data: IStockData[]) {
    const id = (job as ILiveStockScreenerJob).getId();
    const at = new Date(time).toISOString();
    if (this.inFlight.has(job)) {
      console.warn(`[LiveMasterJob] run ${id} skipped ${at}: its previous minute is still running`);
      return;
    }
    const failed = (err: unknown) => console.error(`[LiveMasterJob] run ${id} failed at ${at}`, err);
    try {
      const result: unknown = job.run(time, data);
      if (result instanceof Promise) {
        this.inFlight.add(job);
        result.catch(failed).finally(() => this.inFlight.delete(job));
      }
    } catch (err) {
      failed(err);
    }
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
