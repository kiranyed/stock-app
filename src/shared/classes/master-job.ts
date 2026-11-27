import { PeriodType } from "../constants";
import {
  IJob,
  IStockData,
  IStockScreenerJob,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";
import { IndicatorEngine } from "../../engine/engine";
import { Indicator } from "../../engine/indicators";
import { duePeriods } from "../../engine/bars";

interface Binding {
  name: string;
  symbol: string;
  indicator: Indicator;
}

interface JobState {
  symbols: Set<string>;
  bindings: Binding[];
}

/**
 * Runs a set of strategies over one shared IndicatorEngine. Each strategy is
 * registered with its own symbols; it only sees those symbols, and each
 * unique indicator is computed once for all strategies.
 *
 * A tick is: the periods whose bars close now are fed to the engine, each
 * strategy on one of those periods gets its values copied in, then it runs.
 */
export default abstract class MasterJob implements IJob {
  jobs: IStockScreenerJob[] = [];
  pausedJobs: IStockScreenerJob[] = [];
  group: IStockGroup;
  protected engine = new IndicatorEngine();
  private readonly jobState = new Map<IStockScreenerJob, JobState>();

  constructor(jobs: IStockScreenerJob[], group: IStockGroup) {
    this.group = {
      ...group,
      symbols: group.symbols.map((symbol) => symbol.trim()),
    };
    this.register(jobs, this.group.symbols);
    this.jobs = jobs;
  }

  abstract run(time: number, offset?: number): void;

  /**
   * Create the engine indicators `jobs` read for `symbols` and bind each job
   * to them. Returns the indicators that didn't exist before.
   * Throws InvalidSpecError if a job reads a variable the engine can't compute.
   */
  protected register(jobs: IStockScreenerJob[], symbols: string[]): Set<Indicator> {
    const before = new Set(this.engine.all());
    const trimmed = symbols.map((s) => s.trim());
    for (const job of jobs) {
      const period = job.getPeriod();
      const vars = job.getVars();
      const bindings: Binding[] = [];
      for (const symbol of trimmed) {
        // the job's own bars are always fed, so it gets prices even with no indicators
        this.engine.add(symbol, { kind: "price" }, period);
        for (const { name, spec } of job.getVariables()) {
          (vars[name] ||= {})[symbol] = NaN;
          if (spec) {
            bindings.push({ name, symbol, indicator: this.engine.add(symbol, spec, period) });
          }
        }
      }
      this.jobState.set(job, { symbols: new Set(trimmed), bindings });
    }
    return new Set(this.engine.all().filter((i) => !before.has(i)));
  }

  /** Periods the engine needs bars for, ascending. */
  periods(): PeriodType[] {
    return this.engine.periods();
  }

  symbolsFor(period: PeriodType): string[] {
    return this.engine.symbolsFor(period);
  }

  protected symbolsOf(job: IStockScreenerJob): Set<string> {
    return this.jobState.get(job)?.symbols ?? new Set();
  }

  /** Copy the engine's current values into the job's vars. */
  protected publish(job: IStockScreenerJob) {
    const vars = job.getVars();
    for (const b of this.jobState.get(job)?.bindings ?? []) {
      vars[b.name][b.symbol] = b.indicator.value;
    }
  }

  protected dueJobs(time: number): IStockScreenerJob[] {
    const due = duePeriods(time, this.periods());
    return this.jobs.filter((job) => due.includes(job.getPeriod()));
  }

  /** Run every job whose period closed at the data's time, on its own symbols only. */
  finishJob(data: IStockData[]) {
    if (!data || data.length === 0) {
      return;
    }
    const time = data[0].datetime;
    for (const job of this.dueJobs(time)) {
      const symbols = this.symbolsOf(job);
      const own = data.filter((d) => symbols.has(d.symbol));
      if (own.length) this.runJob(job, time, own);
    }
  }

  /** Run one job. The live master job overrides this to contain each job's errors. */
  protected runJob(job: IStockScreenerJob, time: number, data: IStockData[]) {
    job.run(time, data);
  }
}
