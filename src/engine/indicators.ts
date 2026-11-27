import { CONSTANTS, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";

/**
 * One closed bar for one symbol, the engine's only input. Live quotes and
 * historical candles are both turned into bars before they reach the engine.
 */
export interface Bar {
  symbol: string;
  /** the time the bar is handed to the engine (its close) */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** trading date (ET) the bar belongs to, e.g. "2025-06-23" */
  session: string;
}

/**
 * A streaming indicator for one symbol on one period. `update` gets every bar
 * in order. `skip` is called once for each bar missing inside a session, so
 * windowed indicators don't treat older values as recent. Recursive indicators
 * (EMA, Wilder's RSI, VWAP) ignore gaps, as charting tools do.
 *
 * All mutable state lives in `s`, a plain object, so a warmed-up copy can be
 * transferred with `copyStateFrom`.
 */
export abstract class Indicator<S extends object = object> {
  value = NaN;
  protected s: S;

  constructor(
    readonly key: string,
    readonly period: PeriodType,
    initial: S,
  ) {
    this.s = initial;
  }

  abstract update(bar: Bar): void;
  skip(): void {}
  /** bars of history this indicator needs before its value is valid */
  abstract readonly warmupBars: number;

  copyStateFrom(other: Indicator<S>) {
    this.s = structuredClone(other.s);
    this.value = other.value;
  }
}

/* ------------------------------------------------------------------ */
/* State helpers (plain data, so structuredClone works)                */
/* ------------------------------------------------------------------ */

function push(list: number[], v: number, n: number) {
  list.push(v);
  if (list.length > n) list.shift();
}

/** The full window when all `n` values are present and finite, else null. */
function ready(list: number[], n: number): number[] | null {
  return list.length === n && list.every(Number.isFinite) ? list : null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** First index in ascending `xs` whose value is >= v. */
function lowerBound(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index in ascending `xs` whose value is > v. */
function upperBound(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface EmaState {
  n: number;
  seed: number[];
  prev: number;
}

const ema = (n: number): EmaState => ({ n, seed: [], prev: NaN });

/**
 * EMA seeded with the SMA of the first `n` values. A non-finite input yields
 * NaN; before the seed is complete it also restarts the seed.
 */
function emaNext(st: EmaState, v: number): number {
  if (!Number.isFinite(v)) {
    if (!Number.isFinite(st.prev)) st.seed = [];
    return NaN;
  }
  if (Number.isFinite(st.prev)) {
    const k = 2 / (st.n + 1);
    st.prev = st.prev * (1 - k) + v * k;
    return st.prev;
  }
  st.seed.push(v);
  if (st.seed.length === st.n) {
    st.prev = mean(st.seed);
    st.seed = [];
    return st.prev;
  }
  return NaN;
}

/** A value an indicator reads from another indicator, or a constant. */
export interface Source {
  readonly value: number;
}

/* ------------------------------------------------------------------ */
/* Raw bar fields                                                      */
/* ------------------------------------------------------------------ */

export class Price extends Indicator {
  readonly warmupBars = 1;
  update(bar: Bar) {
    this.value = bar.close;
  }
}

export class Volume extends Indicator {
  readonly warmupBars = 1;
  update(bar: Bar) {
    this.value = bar.volume;
  }
}

/** Minutes since the session opened (0 at 9:30 ET). */
export class TimeOfDay extends Indicator {
  readonly warmupBars = 1;
  update(bar: Bar) {
    this.value =
      StockTradeUtil.getMinutesInDayEastCoast(new Date(bar.t)) -
      CONSTANTS.BEGIN_TIME;
  }
}

/* ------------------------------------------------------------------ */
/* Windowed                                                            */
/* ------------------------------------------------------------------ */

export class PercentChange extends Indicator<{ win: number[] }> {
  readonly warmupBars: number;
  constructor(key: string, period: PeriodType, private readonly bars: number) {
    super(key, period, { win: [] });
    this.warmupBars = bars + 1;
  }
  update(bar: Bar) {
    push(this.s.win, bar.close, this.bars + 1);
    const w = ready(this.s.win, this.bars + 1);
    this.value = w ? (w[w.length - 1] / w[0] - 1) * 100 : NaN;
  }
  skip() {
    push(this.s.win, NaN, this.bars + 1);
  }
}

export class Sma extends Indicator<{ win: number[] }> {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly source: "price" | "volume",
    private readonly bars: number,
  ) {
    super(key, period, { win: [] });
    this.warmupBars = bars;
  }
  update(bar: Bar) {
    push(this.s.win, this.source === "price" ? bar.close : bar.volume, this.bars);
    const w = ready(this.s.win, this.bars);
    this.value = w ? mean(w) : NaN;
  }
  skip() {
    push(this.s.win, NaN, this.bars);
  }
}

/** Bollinger band with population standard deviation (as technicalindicators). */
export class Bollinger extends Indicator<{ win: number[] }> {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly bars: number,
    private readonly multiplier: number,
    private readonly band: "upper" | "middle" | "lower",
  ) {
    super(key, period, { win: [] });
    this.warmupBars = bars;
  }
  update(bar: Bar) {
    push(this.s.win, bar.close, this.bars);
    const w = ready(this.s.win, this.bars);
    if (!w) {
      this.value = NaN;
      return;
    }
    const mid = mean(w);
    const sd = Math.sqrt(mean(w.map((x) => (x - mid) ** 2)));
    const offset = this.band === "upper" ? 1 : this.band === "lower" ? -1 : 0;
    this.value = mid + offset * this.multiplier * sd;
  }
  skip() {
    push(this.s.win, NaN, this.bars);
  }
}

/**
 * Exact percentile rank (mid-rank for ties, 0–100) of the current `bars`-bar
 * percent change among the most recent `sessions` sessions of such changes.
 * For intraday periods a change that spans the overnight gap is left out: it
 * isn't the same kind of move as an in-session one.
 */
export class PercentChangePercentile extends Indicator<{
  closes: number[];
  sessions: string[];
  /** changes in arrival order */
  dist: number[];
  /** the same changes, ascending */
  sorted: number[];
}> {
  readonly warmupBars: number;
  private readonly capacity: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly bars: number,
    sessions: number,
  ) {
    super(key, period, { closes: [], sessions: [], dist: [], sorted: [] });
    const perSession =
      period >= PeriodType.DAY
        ? 1
        : Math.ceil((CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME) / period);
    this.capacity = sessions * perSession;
    this.warmupBars = this.capacity + bars;
  }
  private add(close: number, session: string) {
    const s = this.s;
    s.closes.push(close);
    s.sessions.push(session);
    if (s.closes.length > this.bars + 1) {
      s.closes.shift();
      s.sessions.shift();
    }
  }
  update(bar: Bar) {
    this.add(bar.close, bar.session);
    const { closes, sessions, dist, sorted } = this.s;
    this.value = NaN;
    if (closes.length < this.bars + 1) return;
    const first = closes[0];
    const last = closes[closes.length - 1];
    const sameSession =
      this.period >= PeriodType.DAY || sessions[0] === sessions[sessions.length - 1];
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0 || !sameSession) {
      return;
    }
    const change = (last / first - 1) * 100;
    dist.push(change);
    sorted.splice(lowerBound(sorted, change), 0, change);
    if (dist.length > this.capacity) {
      const old = dist.shift()!;
      sorted.splice(lowerBound(sorted, old), 1);
    }
    const below = lowerBound(sorted, change);
    const equal = upperBound(sorted, change) - below;
    this.value = ((below + 0.5 * equal) / sorted.length) * 100;
  }
  skip() {
    this.add(NaN, "");
  }
}

/* ------------------------------------------------------------------ */
/* Recursive                                                           */
/* ------------------------------------------------------------------ */

export class Ema extends Indicator<{ ema: EmaState }> {
  readonly warmupBars: number;
  constructor(key: string, period: PeriodType, bars: number) {
    super(key, period, { ema: ema(bars) });
    this.warmupBars = bars;
  }
  update(bar: Bar) {
    this.value = emaNext(this.s.ema, bar.close);
  }
  skip() {
    // a gap before the seed is complete restarts it; after that, EMA carries on
    if (!Number.isFinite(this.s.ema.prev)) this.s.ema.seed = [];
  }
}

/** RSI with Wilder's smoothing, seeded by the simple average of the first n changes. */
export class Rsi extends Indicator<{
  prev: number;
  gains: number[];
  losses: number[];
  avgGain: number;
  avgLoss: number;
}> {
  readonly warmupBars: number;
  constructor(key: string, period: PeriodType, private readonly bars: number) {
    super(key, period, { prev: NaN, gains: [], losses: [], avgGain: NaN, avgLoss: NaN });
    this.warmupBars = bars + 1;
  }
  update(bar: Bar) {
    const s = this.s;
    const n = this.bars;
    if (Number.isFinite(s.prev)) {
      const d = bar.close - s.prev;
      const gain = Math.max(d, 0);
      const loss = Math.max(-d, 0);
      if (Number.isFinite(s.avgGain)) {
        s.avgGain = (s.avgGain * (n - 1) + gain) / n;
        s.avgLoss = (s.avgLoss * (n - 1) + loss) / n;
      } else {
        s.gains.push(gain);
        s.losses.push(loss);
        if (s.gains.length === n) {
          s.avgGain = mean(s.gains);
          s.avgLoss = mean(s.losses);
          s.gains = [];
          s.losses = [];
        }
      }
    }
    s.prev = bar.close;
    this.value = !Number.isFinite(s.avgGain)
      ? NaN
      : s.avgLoss === 0
        ? 100
        : 100 - 100 / (1 + s.avgGain / s.avgLoss);
  }
  skip() {
    // the change across a missing bar is unknown; before seeding, restart
    this.s.prev = NaN;
    if (!Number.isFinite(this.s.avgGain)) {
      this.s.gains = [];
      this.s.losses = [];
    }
  }
}

/** MACD line: EMA(fast) − EMA(slow). Reads the two shared EMA indicators. */
export class Macd extends Indicator {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly fast: Source,
    private readonly slow: Source,
    slowBars: number,
  ) {
    super(key, period, {});
    this.warmupBars = slowBars;
  }
  update() {
    this.value = this.fast.value - this.slow.value;
  }
}

export class MacdSignal extends Indicator<{ ema: EmaState }> {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly macd: Source,
    slowBars: number,
    signal: number,
  ) {
    super(key, period, { ema: ema(signal) });
    this.warmupBars = slowBars + signal - 1;
  }
  update() {
    this.value = emaNext(this.s.ema, this.macd.value);
  }
}

/** Session-anchored VWAP on typical price (h + l + c) / 3. */
export class Vwap extends Indicator<{ session: string; num: number; den: number }> {
  readonly warmupBars = 1;
  constructor(key: string, period: PeriodType) {
    super(key, period, { session: "", num: 0, den: 0 });
  }
  update(bar: Bar) {
    const s = this.s;
    if (bar.session !== s.session) {
      s.session = bar.session;
      s.num = 0;
      s.den = 0;
    }
    s.num += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    s.den += bar.volume;
    this.value = s.den > 0 ? s.num / s.den : NaN;
  }
}

interface DoubleSmoothed {
  num1: EmaState;
  num2: EmaState;
  den1: EmaState;
  den2: EmaState;
}

const doubleSmoothed = (m: number, n: number): DoubleSmoothed => ({
  num1: ema(m),
  num2: ema(n),
  den1: ema(m),
  den2: ema(n),
});

/** 100 × EMA_n(EMA_m(x)) / EMA_n(EMA_m(|x|)) */
function doubleSmoothedRatio(st: DoubleSmoothed, x: number): number {
  const num = emaNext(st.num2, emaNext(st.num1, x));
  const den = emaNext(st.den2, emaNext(st.den1, Math.abs(x)));
  return Number.isFinite(num) && Number.isFinite(den) && den !== 0
    ? (100 * num) / den
    : NaN;
}

/** MTSI: double-smoothed ratio of ln(price / VWAP). Ranges −100 to +100. */
export class Mtsi extends Indicator<{ ds: DoubleSmoothed }> {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly vwap: Source,
    m: number,
    n: number,
  ) {
    super(key, period, { ds: doubleSmoothed(m, n) });
    this.warmupBars = m + n - 1;
  }
  update(bar: Bar) {
    const v = this.vwap.value;
    const x = Number.isFinite(v) && v > 0 ? Math.log(bar.close / v) : NaN;
    this.value = doubleSmoothedRatio(this.s.ds, x);
  }
}

/** True Strength Index on 1-bar price changes. */
export class Tsi extends Indicator<{ prev: number; ds: DoubleSmoothed }> {
  readonly warmupBars: number;
  constructor(key: string, period: PeriodType, m: number, n: number) {
    super(key, period, { prev: NaN, ds: doubleSmoothed(m, n) });
    this.warmupBars = m + n;
  }
  update(bar: Bar) {
    const d = bar.close - this.s.prev;
    this.s.prev = bar.close;
    this.value = doubleSmoothedRatio(this.s.ds, d);
  }
  skip() {
    this.s.prev = NaN;
  }
}

/* ------------------------------------------------------------------ */
/* Signals over other indicators                                        */
/* ------------------------------------------------------------------ */

/**
 * 1 when `a` was on one side of `b` for `before` bars and then on the other
 * side for the `after` bars ending now (below→above when bullish), else 0.
 * NaN until the whole window is known.
 */
export class Crossover extends Indicator<{ a: number[]; b: number[] }> {
  readonly warmupBars: number;
  private readonly n: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly a: Source,
    private readonly b: Source,
    private readonly before: number,
    after: number,
    private readonly bullish: boolean,
    inputWarmup: number,
  ) {
    super(key, period, { a: [], b: [] });
    this.n = before + after;
    this.warmupBars = inputWarmup + this.n - 1;
  }
  private add(a: number, b: number) {
    push(this.s.a, a, this.n);
    push(this.s.b, b, this.n);
  }
  update() {
    this.add(this.a.value, this.b.value);
    const a = ready(this.s.a, this.n);
    const b = ready(this.s.b, this.n);
    if (!a || !b) {
      this.value = NaN;
      return;
    }
    let ok = true;
    for (let i = 0; i < this.n && ok; i++) {
      const firstSide = i < this.before;
      const below = a[i] < b[i];
      const above = a[i] > b[i];
      ok = firstSide === this.bullish ? below : above;
    }
    this.value = Number(ok);
  }
  skip() {
    this.add(NaN, NaN);
  }
}

/**
 * Divergence between price and an oscillator over the last `lookback` bars,
 * using 1-bar pivots on closes: bullish when the last two pivot lows have a
 * lower price but a higher oscillator value, bearish the mirror image.
 * 0 when there are fewer than two pivots, NaN until the window is known.
 */
export class Divergence extends Indicator<{ p: number[]; sig: number[] }> {
  readonly warmupBars: number;
  constructor(
    key: string,
    period: PeriodType,
    private readonly signal: Source,
    private readonly lookback: number,
    private readonly bullish: boolean,
    inputWarmup: number,
  ) {
    super(key, period, { p: [], sig: [] });
    this.warmupBars = inputWarmup + lookback - 1;
  }
  update(bar: Bar) {
    push(this.s.p, bar.close, this.lookback);
    push(this.s.sig, this.signal.value, this.lookback);
    const p = ready(this.s.p, this.lookback);
    const s = ready(this.s.sig, this.lookback);
    if (!p || !s) {
      this.value = NaN;
      return;
    }
    let x = -1;
    let y = -1;
    for (let k = 1; k < p.length - 1; k++) {
      const pivot = this.bullish
        ? p[k] < p[k - 1] && p[k] < p[k + 1]
        : p[k] > p[k - 1] && p[k] > p[k + 1];
      if (pivot) {
        x = y;
        y = k;
      }
    }
    if (x < 0) {
      this.value = 0;
      return;
    }
    this.value = Number(
      this.bullish
        ? s[y] > s[x] && p[y] < p[x]
        : p[y] > p[x] && s[y] < s[x],
    );
  }
  skip() {
    push(this.s.p, NaN, this.lookback);
    push(this.s.sig, NaN, this.lookback);
  }
}
