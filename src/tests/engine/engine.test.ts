import { BollingerBands, EMA, MACD, RSI, SMA } from "technicalindicators";
import { IndicatorEngine } from "../../engine/engine";
import { Crossover } from "../../engine/indicators";
import { IndicatorSpec, InvalidSpecError, keyOf } from "../../engine/specs";
import { duePeriods } from "../../engine/bars";
import { PeriodType } from "../../shared/constants";

const MIN = 60_000;
const SYM = "AAA";
const t0 = new Date("2025-06-23T09:31:00-04:00").getTime();

function closes(n: number, seed = 1): number[] {
  let x = seed;
  let p = 100;
  return Array.from({ length: n }, () => {
    x = (x * 16807) % 2147483647;
    p *= 1 + ((x / 2147483647) - 0.5) * 0.02;
    return p;
  });
}

const bar = (close: number, volume = 1000) => ({
  symbol: SYM, open: close, high: close, low: close, close, volume,
});

/** Run specs over daily closes and return each spec's value series. */
function runDaily(specs: IndicatorSpec[], values: number[]) {
  const engine = new IndicatorEngine();
  const inds = specs.map((s) => engine.add(SYM, s, PeriodType.DAY));
  const out = specs.map(() => [] as number[]);
  values.forEach((c, i) => {
    engine.onBars(t0 + i * 1440 * MIN, { [PeriodType.DAY]: [bar(c)] });
    inds.forEach((ind, j) => out[j].push(ind.value));
  });
  return out;
}

const align = (ref: number[], n: number) => [...new Array(n - ref.length).fill(NaN), ...ref];
const close = (a: number[], b: number[], tol: number) =>
  a.every((v, i) => (Number.isNaN(v) && Number.isNaN(b[i])) || Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])));

describe("engine indicators vs technicalindicators", () => {
  const c = closes(120);

  it("SMA, EMA, Bollinger", () => {
    const [sma, ema, upper, lower] = runDaily(
      [
        { kind: "sma", source: "price", bars: 20 },
        { kind: "ema", bars: 12 },
        { kind: "bollinger", bars: 20, multiplier: 2, band: "upper" },
        { kind: "bollinger", bars: 20, multiplier: 2, band: "lower" },
      ],
      c,
    );
    expect(close(sma, align(SMA.calculate({ period: 20, values: c }), c.length), 1e-9)).toBe(true);
    expect(close(ema, align(EMA.calculate({ period: 12, values: c }), c.length), 1e-9)).toBe(true);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: c });
    expect(close(upper, align(bb.map((b) => b.upper), c.length), 1e-9)).toBe(true);
    expect(close(lower, align(bb.map((b) => b.lower), c.length), 1e-9)).toBe(true);
  });

  it("RSI is Wilder's, NaN until period + 1 prices", () => {
    const [rsi] = runDaily([{ kind: "rsi", bars: 14 }], c);
    expect(rsi.slice(0, 14).filter(Number.isFinite)).toEqual([]);
    // technicalindicators rounds to 2 decimals
    expect(close(rsi, align(RSI.calculate({ period: 14, values: c }), c.length), 0.006)).toBe(true);
  });

  it("MACD line and signal", () => {
    const [macd, signal] = runDaily(
      [
        { kind: "macd", fast: 12, slow: 26 },
        { kind: "macdSignal", fast: 12, slow: 26, signal: 9 },
      ],
      c,
    );
    const ref = MACD.calculate({ values: c, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    expect(close(macd, align(ref.map((r) => r.MACD ?? NaN), c.length), 1e-9)).toBe(true);
    expect(close(signal, align(ref.map((r) => r.signal ?? NaN), c.length), 1e-9)).toBe(true);
  });
});

describe("engine bookkeeping", () => {
  it("shares one indicator per (symbol, period, key), including dependencies", () => {
    const engine = new IndicatorEngine();
    const a = engine.add(SYM, { kind: "macd", fast: 12, slow: 26 }, PeriodType.DAY);
    const b = engine.add(SYM, { kind: "macd", fast: 12, slow: 26 }, PeriodType.DAY);
    const ema = engine.add(SYM, { kind: "ema", bars: 12 }, PeriodType.DAY);
    expect(a).toBe(b);
    expect(engine.get(SYM, PeriodType.DAY, "priceEma12")).toBe(ema);
    expect(engine.add(SYM, { kind: "macd", fast: 12, slow: 26 }, PeriodType.MINUTE)).not.toBe(a);
  });

  it("VWAP lives on its own bar period", () => {
    const engine = new IndicatorEngine();
    engine.add(SYM, { kind: "mtsi", m: 2, n: 2, vwapPeriod: PeriodType.FIVE_MINUTES }, PeriodType.THIRTY_MINUTES);
    expect(engine.periods()).toEqual([PeriodType.FIVE_MINUTES, PeriodType.THIRTY_MINUTES]);
    expect(engine.get(SYM, PeriodType.FIVE_MINUTES, "vwap5")).toBeDefined();
  });

  it("rejects invalid settings", () => {
    const engine = new IndicatorEngine();
    expect(() => engine.add(SYM, { kind: "sma", source: "price", bars: 0 }, PeriodType.DAY)).toThrow(InvalidSpecError);
    expect(() => engine.add(SYM, { kind: "macd", fast: 26, slow: 12 }, PeriodType.DAY)).toThrow(InvalidSpecError);
    expect(() => engine.add(SYM, { kind: "percentChangePercentile", bars: 1, sessions: 3 }, PeriodType.MINUTE)).toThrow(/exceeds max 2/);
  });

  it("a bar missing inside a session makes windows NaN; the overnight gap doesn't", () => {
    const engine = new IndicatorEngine();
    const pc = engine.add(SYM, { kind: "percentChange", bars: 2 }, PeriodType.MINUTE);
    const feed = (t: number, c: number) => {
      engine.onBars(t, { [PeriodType.MINUTE]: [bar(c)] });
      return pc.value;
    };
    feed(t0, 100);
    feed(t0 + MIN, 101);
    expect(feed(t0 + 2 * MIN, 102)).toBeCloseTo(2, 9);
    // 09:34 missing
    expect(feed(t0 + 4 * MIN, 104)).toBeNaN();
    expect(feed(t0 + 5 * MIN, 105)).toBeNaN();
    expect(feed(t0 + 6 * MIN, 106)).toBeCloseTo((106 / 104 - 1) * 100, 9);
    // next morning 09:31: compares against yesterday's last two bars
    const nextDay = t0 + 1440 * MIN;
    expect(feed(nextDay, 107)).toBeCloseTo((107 / 105 - 1) * 100, 9);
  });

  it("VWAP restarts each session", () => {
    const engine = new IndicatorEngine();
    const v = engine.add(SYM, { kind: "vwap", barPeriod: PeriodType.MINUTE }, PeriodType.MINUTE);
    engine.onBars(t0, { [PeriodType.MINUTE]: [bar(10, 100)] });
    engine.onBars(t0 + MIN, { [PeriodType.MINUTE]: [bar(20, 100)] });
    expect(v.value).toBe(15);
    engine.onBars(t0 + 1440 * MIN, { [PeriodType.MINUTE]: [bar(30, 100)] });
    expect(v.value).toBe(30);
  });

  it("a bar for a time already fed is ignored", () => {
    const engine = new IndicatorEngine();
    const sma = engine.add(SYM, { kind: "sma", source: "price", bars: 2 }, PeriodType.MINUTE);
    engine.onBars(t0, { [PeriodType.MINUTE]: [bar(10)] });
    engine.onBars(t0 + MIN, { [PeriodType.MINUTE]: [bar(20)] });
    engine.onBars(t0 + MIN, { [PeriodType.MINUTE]: [bar(90)] });
    expect(sma.value).toBe(15);
  });

  it("copyStateFrom transfers warmed-up state", () => {
    const warm = new IndicatorEngine();
    const live = new IndicatorEngine();
    const spec: IndicatorSpec = { kind: "sma", source: "price", bars: 2 };
    warm.add(SYM, spec, PeriodType.DAY);
    const target = live.add(SYM, spec, PeriodType.DAY);
    warm.onBars(t0, { [PeriodType.DAY]: [bar(10)] });
    warm.onBars(t0 + 1440 * MIN, { [PeriodType.DAY]: [bar(20)] });
    live.copyStateFrom(warm);
    expect(target.value).toBe(15);
    live.onBars(t0 + 2 * 1440 * MIN, { [PeriodType.DAY]: [bar(40)] });
    expect(target.value).toBe(30);
  });

  it("keys carry every param that changes the value", () => {
    expect(keyOf({ kind: "bollinger", bars: 20, multiplier: 2, band: "upper" })).toBe("bollingerBands20Multiplier2Upper");
    expect(keyOf({ kind: "macdCrossover", fast: 12, slow: 26, signal: 9, before: 2, after: 3, bullish: false }))
      .toBe("macdFast12Slow26Signal9BearishCrossoverPeriodsBefore2PeriodsAfter3");
    expect(keyOf({ kind: "rsiDivergence", bars: 14, lookback: 20, bullish: true })).toBe("rsi14BullishDivergenceLookback20");
  });
});

/* Formerly macd-crossover-engine.golden.test.ts (Phase 1 item 4): before ≠ after
   in every case, so swapping the two changes the answer. */
describe("crossover uses before/after in the right order", () => {
  function run(bullish: boolean, before: number, after: number, a: number[], b: number[]) {
    const src = { value: NaN };
    const sig = { value: NaN };
    const x = new Crossover("x", PeriodType.DAY, src, sig, before, after, bullish, 1);
    a.forEach((v, i) => {
      src.value = v;
      sig.value = b[i];
      x.update();
    });
    return x.value;
  }
  const signal = [NaN, NaN, 0, 0, 0, 0];

  it("bullish, 3 below then 1 above, before=3 after=1 → 1", () => {
    expect(run(true, 3, 1, [NaN, NaN, -3, -2, -1, 1], signal)).toBe(1);
  });
  it("bullish, 1 below then 3 above, before=3 after=1 → 0", () => {
    expect(run(true, 3, 1, [NaN, NaN, -1, 1, 2, 3], signal)).toBe(0);
  });
  it("bullish, 1 below then 3 above, before=1 after=3 → 1", () => {
    expect(run(true, 1, 3, [NaN, NaN, -1, 1, 2, 3], signal)).toBe(1);
  });
  it("bearish, 3 above then 1 below, before=3 after=1 → 1", () => {
    expect(run(false, 3, 1, [NaN, NaN, 3, 2, 1, -1], signal)).toBe(1);
  });
  it("bearish, 1 above then 3 below, before=3 after=1 → 0", () => {
    expect(run(false, 3, 1, [NaN, NaN, 1, -1, -2, -3], signal)).toBe(0);
  });
  it("NaN until the whole window is known", () => {
    expect(run(true, 3, 1, [NaN, -3, -2, 1], [0, 0, 0, 0])).toBeNaN();
  });
});

describe("duePeriods", () => {
  const at = (hhmm: string) => new Date(`2025-06-23T${hhmm}:00-04:00`).getTime();
  const all = [PeriodType.MINUTE, PeriodType.THIRTY_MINUTES, PeriodType.DAY];
  it("intraday periods close on their grid; DAY at 15:59", () => {
    expect(duePeriods(at("10:00"), all)).toEqual([PeriodType.MINUTE, PeriodType.THIRTY_MINUTES]);
    expect(duePeriods(at("10:01"), all)).toEqual([PeriodType.MINUTE]);
    expect(duePeriods(at("15:59"), all)).toEqual([PeriodType.MINUTE, PeriodType.DAY]);
    expect(duePeriods(at("16:00"), all)).toEqual([]);
    expect(duePeriods(at("09:29"), all)).toEqual([]);
  });
});
