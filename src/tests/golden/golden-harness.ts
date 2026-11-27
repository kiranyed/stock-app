/**
 * Golden end-to-end harness. No jest.mock anywhere: every run goes through the
 * real engine (BackTestMasterJob / LiveMasterJob -> IndicatorEngine -> BackTest
 * strategy). The only things supplied by the
 * test are the input data (candles injected into the real BackTestHelper, or
 * quote snapshots handed to LiveMasterJob.handleNewData) and a BackTest subclass
 * that records the strategy's vars after each bar.
 */
import { BackTest } from "../../back-testing/back-test";
import { BackTestMasterJob } from "../../shared/classes/back-test-master-job";
import { LiveMasterJob } from "../../shared/classes/live-master-job";
import { BackTestService } from "../../run/back-test-service";
import { CONSTANTS, PeriodType } from "../../shared/constants";
import { FilterVariable, filterVariables } from "../../engine/filter-specs";
import { ICandle, ICandleDataMap } from "../../types/back-test-types";
import {
  IBackTestScreenerJob,
  ILiveStockScreenerJob,
  IStockData,
} from "../../types/data-processing-types";
import { IFilter, IStrategy } from "../../types/strategy-types";

export const MIN = CONSTANTS.MILLIS_IN_MINUTE;

/* ------------------------------------------------------------------ */
/* Deterministic data                                                  */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 09:30 ET on an EDT date (all fixtures are June–Sept 2025, so -04:00). */
export function etOpen(isoDate: string): number {
  return new Date(`${isoDate}T09:30:00-04:00`).getTime();
}
export function etTime(isoDate: string, hhmm: string): number {
  return new Date(`${isoDate}T${hhmm}:00-04:00`).getTime();
}

/** Consecutive weekdays starting at isoDate (no holiday logic needed for fixtures). */
export function weekdays(isoDate: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${isoDate}T12:00:00Z`);
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Random-walk OHLCV candles; `drift` lets a fixture force trends. */
export function walkCandles(
  times: number[],
  seed: number,
  start = 100,
  opts: { vol?: number; drift?: (i: number) => number } = {},
): ICandle[] {
  const rnd = mulberry32(seed);
  const vol = opts.vol ?? 0.004;
  let close = start;
  return times.map((datetime, i) => {
    const open = close;
    const r = (rnd() - 0.5) * 2 * vol + (opts.drift ? opts.drift(i) : 0);
    close = Math.max(1, open * (1 + r));
    const high = Math.max(open, close) * (1 + rnd() * vol * 0.5);
    const low = Math.min(open, close) * (1 - rnd() * vol * 0.5);
    const volume = Math.round(1000 + rnd() * 9000);
    return { datetime, open, high, low, close, volume };
  });
}

/** Intraday candle start times for one session at a given period. */
export function sessionTimes(isoDate: string, period: number): number[] {
  const open = etOpen(isoDate);
  const out: number[] = [];
  for (let m = 0; m < CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME; m += period) {
    out.push(open + m * MIN);
  }
  return out;
}

/**
 * What BackTestHelper.getTestData feeds the engine for an intraday period: at
 * the time of candle i it feeds candle i-1 (close, h/l, volume), never at the
 * session's first minute. This mirrors the helper so references line up bar
 * for bar with what the engine saw.
 */
export interface FedBar {
  t: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  day: string;
}
export function fedIntraday(
  candlesByDay: Record<string, ICandle[]>,
): FedBar[] {
  const out: FedBar[] = [];
  for (const [day, candles] of Object.entries(candlesByDay)) {
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      out.push({
        t: candles[i].datetime,
        close: prev.close,
        high: prev.high,
        low: prev.low,
        volume: prev.volume,
        day,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Strategy construction                                               */
/* ------------------------------------------------------------------ */

/** A filter that is never true, so the probe never trades by accident. */
export const NEVER: IFilter = {
  varName: "price",
  operator: "<",
  compareVal: "-1",
};

export function strategy(
  period: PeriodType,
  enterFilters: object[],
  exitFilters: object[] = [NEVER],
  id = 1,
): IStrategy {
  return {
    id,
    name: `golden-${id}`,
    description: "golden test",
    period,
    screeners: [
      {
        buySellFilters: {
          enter: {
            filters: enterFilters as IFilter[],
            connectors: enterFilters.slice(1).map(() => "AND"),
          },
          exit: {
            filters: exitFilters as IFilter[],
            connectors: exitFilters.slice(1).map(() => "AND"),
          },
        },
      },
    ],
  };
}

export type Snapshot = Record<string, Record<string, number>>;

/**
 * A real BackTest strategy that snapshots its vars every time the master job
 * runs it. By default it does not evaluate its screeners, so indicator values
 * can be checked independently of the screener. `evaluate: true` runs the real
 * StrategyRun.run (screeners, positions) after the snapshot.
 */
export class ProbeBackTest
  extends BackTest
  implements IBackTestScreenerJob, ILiveStockScreenerJob
{
  history: { t: number; vars: Snapshot }[] = [];
  /** every bar the master job handed this strategy, by run time */
  fed: { t: number; symbol: string; price: number }[] = [];
  private readonly extraVars: FilterVariable[];
  private readonly evaluate: boolean;
  private id = 0;

  /** `extraVars`: filters whose variables are computed without being screened on */
  constructor(
    strat: IStrategy,
    opts: { extraVars?: object[]; evaluate?: boolean } = {},
  ) {
    super(strat);
    this.extraVars = (opts.extraVars ?? []).flatMap((f) =>
      filterVariables({ operator: ">", compareVal: "0", ...f } as IFilter, strat.period),
    );
    this.evaluate = opts.evaluate ?? false;
  }

  getVariables() {
    return [...super.getVariables(), ...this.extraVars];
  }

  snapshot(t: number) {
    const vars = this.getVars();
    const copy: Snapshot = {};
    for (const k of Object.keys(vars)) copy[k] = { ...vars[k] };
    this.history.push({ t, vars: copy });
  }

  run(datetime: number, stockData: IStockData[]) {
    this.snapshot(datetime);
    for (const d of stockData) {
      this.fed.push({ t: datetime, symbol: d.symbol, price: d.price });
    }
    if (this.evaluate) super.run(datetime, stockData);
  }

  getId() {
    return this.id;
  }
  setId(id: number) {
    this.id = id;
  }
  openPositions(): string[] {
    return Object.keys(this.getPositions());
  }

  /** value of `key` for `symbol` keyed by bar time */
  series(key: string, symbol: string): Map<number, number> {
    const m = new Map<number, number>();
    for (const h of this.history) m.set(h.t, h.vars[key]?.[symbol] ?? NaN);
    return m;
  }
}

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Real backtest: BackTestMasterJob + BackTestService.iterateThroughCandlesAndRun.
 * Candles are injected into the master job's real BackTestHelper instead of being
 * fetched from Polygon (prepareJobs is the only network step, so it is skipped).
 */
export function runBacktest(
  jobs: ProbeBackTest[],
  symbols: string[],
  candles: Partial<Record<PeriodType, Record<string, ICandle[]>>>,
  startTime: number,
  endTime: number,
) {
  const group = { id: 1, name: "golden", symbols };
  const master = new BackTestMasterJob(jobs, group, { startTime, endTime });

  const helper = (master as unknown as { backTestHelper: { candleData: Partial<Record<PeriodType, ICandleDataMap>> } }).backTestHelper;
  for (const [p, bySymbol] of Object.entries(candles)) {
    const map: ICandleDataMap = {};
    for (const [symbol, list] of Object.entries(bySymbol ?? {})) {
      map[symbol] = { empty: false, symbol, candles: list, index: 0 };
    }
    helper.candleData[Number(p) as PeriodType] = map;
  }

  BackTestService.iterateThroughCandlesAndRun(master, {
    startTime,
    endTime,
    minimumPeriod: master.periods()[0],
  });
  return master;
}

/** Live setup as LiveJobRunner does it, minus the network warmup. */
export function startLive(jobs: ProbeBackTest[], symbols: string[]) {
  return new LiveMasterJob(jobs, { id: 1, name: "live", symbols });
}

/** One live tick: handleNewData (the engine) then snapshot each job. */
export function liveTick(
  master: LiveMasterJob,
  jobs: ProbeBackTest[],
  quotes: IStockData[],
) {
  master.handleNewData(quotes);
  for (const j of jobs) j.snapshot(quotes[0].datetime);
}

/* ------------------------------------------------------------------ */
/* Independent references (not from the app)                           */
/* ------------------------------------------------------------------ */

/** Wilder's RSI, unrounded: SMA seed over the first N changes, then (prev·(N−1) + x)/N. */
export function wilderRsi(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let g = 0,
    l = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = Math.max(d, 0);
    const loss = Math.max(-d, 0);
    if (i <= period) {
      g += gain / period;
      l += loss / period;
    } else {
      g = (g * (period - 1) + gain) / period;
      l = (l * (period - 1) + loss) / period;
    }
    if (i >= period) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

/** EMA with SMA seed, NaN until seeded. */
export function emaSeries(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seedBuf: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      seedBuf = [];
      continue;
    }
    if (Number.isFinite(prev)) {
      prev = prev * (1 - k) + v * k;
    } else {
      seedBuf.push(v);
      if (seedBuf.length === period) {
        prev = seedBuf.reduce((a, b) => a + b, 0) / period;
      }
    }
    out[i] = prev;
  }
  return out;
}

/** App's crossover definition: `before` bars on one side, then `after` on the other. */
export function crossoverRef(
  a: number[],
  b: number[] | number,
  before: number,
  after: number,
  bullish: boolean,
): number[] {
  const out = new Array(a.length).fill(NaN);
  const bAt = (i: number) => (typeof b === "number" ? b : b[i]);
  for (let i = before + after - 1; i < a.length; i++) {
    let ok = true;
    let finite = true;
    for (let j = i - before - after + 1; j <= i; j++) {
      if (!Number.isFinite(a[j]) || !Number.isFinite(bAt(j))) finite = false;
      const isBefore = j <= i - after;
      const below = a[j] < bAt(j);
      const above = a[j] > bAt(j);
      if (isBefore) ok &&= bullish ? below : above;
      else ok &&= bullish ? above : below;
    }
    out[i] = finite ? Number(ok) : NaN;
  }
  return out;
}

/** App's divergence definition (1-bar pivots on closes, last two pivots in window). */
export function divergenceRef(
  prices: number[],
  signal: number[],
  window: number,
  bullish: boolean,
): number[] {
  const out = new Array(prices.length).fill(NaN);
  for (let i = window - 1; i < prices.length; i++) {
    const p = prices.slice(i - window + 1, i + 1);
    const s = signal.slice(i - window + 1, i + 1);
    if (!s.every(Number.isFinite)) continue;
    const piv: { p: number; s: number }[] = [];
    for (let k = 1; k < p.length - 1; k++) {
      const isPivot = bullish
        ? p[k] < p[k - 1] && p[k] < p[k + 1]
        : p[k] > p[k - 1] && p[k] > p[k + 1];
      if (isPivot) piv.push({ p: p[k], s: s[k] });
    }
    if (piv.length < 2) {
      out[i] = 0;
      continue;
    }
    const [x, y] = piv.slice(-2);
    out[i] = Number(bullish ? y.s > x.s && y.p < x.p : y.p > x.p && y.s < x.s);
  }
  return out;
}

/** Mismatch list for reporting: [index, actual, expected] where they differ. */
export function diffs(
  actual: number[],
  expected: number[],
  tol: number,
): { mismatches: number; of: number; first: [number, number, number][] } {
  const out: [number, number, number][] = [];
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];
    if (Number.isNaN(e) && Number.isNaN(a)) continue;
    if (Number.isNaN(e) !== Number.isNaN(a) || Math.abs(a - e) > tol * Math.max(1, Math.abs(e))) {
      out.push([i, a, e]);
    }
  }
  // compact so a failing golden test does not dump hundreds of rows
  return { mismatches: out.length, of: expected.length, first: out.slice(0, 3) };
}

export const MATCH = expect.objectContaining({ mismatches: 0 });
