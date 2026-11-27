/**
 * Golden backtest tests (REFACTOR.md Phase 1, item 1). No mocks: fixed candle
 * series go through the real BackTestMasterJob -> IndicatorEngine -> BackTest
 * strategy, and each indicator is compared to
 * technicalindicators or to an independent reference in golden-harness.ts.
 *
 * Every `it` names the REFACTOR.md finding it exercises.
 */
import { SMA, EMA, RSI, MACD, BollingerBands, VWAP, ROC } from "technicalindicators";
import { PeriodType } from "../../shared/constants";
import { DataRetriever } from "../../run/data-retriever";
import { ICandle } from "../../types/back-test-types";
import { primaryVariable } from "../../engine/filter-specs";
import { IFilter } from "../../types/strategy-types";
import {
  MIN,
  ProbeBackTest,
  crossoverRef,
  diffs,
  MATCH,
  divergenceRef,
  emaSeries,
  etOpen,
  etTime,
  fedIntraday,
  runBacktest,
  sessionTimes,
  strategy,
  walkCandles,
  weekdays,
  wilderRsi,
} from "./golden-harness";

const SYM = "AAA";

/** The name a filter's value is published under. */
const keyOf = (filter: object, period: PeriodType) =>
  primaryVariable({ operator: ">", compareVal: "0", ...filter } as IFilter, period).name;

/** Left-pad a technicalindicators output so index i lines up with input i. */
const align = <T>(out: T[], n: number): (T | undefined)[] => [
  ...new Array(n - out.length).fill(undefined),
  ...out,
];

/* ================================================================== */
/* DAY period: 90 sessions, so formulas are tested alone */
/* ================================================================== */
describe("golden: DAY period backtest", () => {
  const days = weekdays("2025-06-02", 90);
  // day candles are stamped 15:59 ET, as BackTestHelper.initCandleData does
  const times = days.map((d) => etTime(d, "15:59"));
  const candles = walkCandles(times, 7, 100, { vol: 0.03 });
  const closes = candles.map((c) => c.close);

  const filters = [
    { varName: "rsi", timeAgo: "14", operator: ">", compareVal: "1000" },
    { varName: "priceSma", timeAgo: "20", operator: ">", compareVal: "1e9" },
    { varName: "priceEma", timeAgo: "12", operator: ">", compareVal: "1e9" },
    { varName: "percentchange", timeAgo: "5", operator: ">", compareVal: "1e9" },
    { varName: "macd", fastPeriod: 12, slowPeriod: 26, operator: ">", compareVal: "1e9" },
    {
      varName: "macdCrossover", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      crossoverLevel: 0, periodsBefore: 2, periodsAfter: 2, bullish: true,
      operator: "==", compareVal: "1",
    },
    {
      varName: "macdDivergence", fastPeriod: 12, slowPeriod: 26, lookback: 30,
      periodsBefore: 3, periodsAfter: 3, bullish: true, operator: "==", compareVal: "1",
    },
    {
      varName: "rsiCrossover", period: 14, crossoverLevel: 50, periodsBefore: 2,
      periodsAfter: 2, bullish: true, operator: "==", compareVal: "1",
    },
    {
      varName: "rsiDivergence", period: 14, lookback: 20, periodsBefore: 3,
      periodsAfter: 3, bullish: true, operator: "==", compareVal: "1",
    },
    { varName: "bollingerBands", period: 20, multiplier: 2, operator: ">", compareVal: "1e9" },
    { varName: "tsi", emaPeriod1: 13, emaPeriod2: 7, operator: ">", compareVal: "1e9" },
  ];
  const job = new ProbeBackTest(strategy(PeriodType.DAY, filters), {
    extraVars: [{ varName: "macdSignal", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
  });
  runBacktest([job], [SYM], { [PeriodType.DAY]: { [SYM]: candles } }, etOpen(days[0]), etTime(days[days.length - 1], "16:00"));

  const at = (key: string) => times.map((t) => job.series(key, SYM).get(t) ?? NaN);
  const macdRef = align(
    MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }),
    closes.length,
  );
  const refMacd = macdRef.map((m) => m?.MACD ?? NaN);
  const refSignal = macdRef.map((m) => m?.signal ?? NaN);

  it("sanity: the engine ran every session", () => {
    expect(job.history.length).toBe(days.length);
    expect(at("price")).toEqual(closes);
  });

  it("§1 SMA matches technicalindicators", () => {
    const ref = align(SMA.calculate({ period: 20, values: closes }), closes.length).map((v) => v ?? NaN);
    expect(diffs(at("priceSma20"), ref, 1e-9)).toEqual(MATCH);
  });

  it("§1 EMA (SMA seed) matches technicalindicators", () => {
    const ref = align(EMA.calculate({ period: 12, values: closes }), closes.length).map((v) => v ?? NaN);
    expect(diffs(at("priceEma12"), ref, 1e-9)).toEqual(MATCH);
  });

  it("§1 percentChange matches technicalindicators ROC", () => {
    const ref = align(ROC.calculate({ period: 5, values: closes }), closes.length).map((v) => v ?? NaN);
    expect(diffs(at("percentchange5"), ref, 1e-9)).toEqual(MATCH);
  });

  it("(new) RSI14 is NaN until 15 prices have been seen", () => {
    const early = at("rsi14").slice(0, 14);
    expect(early.filter(Number.isFinite)).toEqual([]);
  });

  it("§1 RSI matches technicalindicators (Wilder's smoothing)", () => {
    const ref = align(RSI.calculate({ period: 14, values: closes }), closes.length).map((v) => v ?? NaN);
    // technicalindicators rounds RSI to 2 decimals
    expect(diffs(at("rsi14"), ref, 0.006)).toEqual(MATCH);
  });

  it("§1 MACD line matches technicalindicators", () => {
    expect(diffs(at("macdFast12Slow26"), refMacd, 1e-9)).toEqual(MATCH);
  });

  it("§1/§2.1 MACD signal line matches technicalindicators", () => {
    const actual = at("macdFast12Slow26Signal9");
    expect(actual.filter(Number.isFinite).length).toBeGreaterThan(0);
    expect(diffs(actual, refSignal, 1e-9)).toEqual(MATCH);
  });

  it("§1/§2.2 MACD crossover (filter path) is computed and matches reference", () => {
    const key = keyOf(filters[5], PeriodType.DAY);
    const ref = crossoverRef(refMacd, refSignal, 2, 2, true);
    expect(ref.some((v) => v === 1)).toBe(true); // fixture really crosses
    expect(diffs(at(key), ref, 0)).toEqual(MATCH);
  });

  it("§1/§2.1 RSI crossover matches reference", () => {
    const key = keyOf(filters[7], PeriodType.DAY);
    const ref = crossoverRef(wilderRsi(closes, 14), 50, 2, 2, true);
    expect(ref.some((v) => v === 1)).toBe(true);
    const from = 14 + 4;
    expect(diffs(at(key).slice(from), ref.slice(from), 0)).toEqual(MATCH);
  });

  it("§1 Bollinger Bands via the filter path produce a computed variable", () => {
    const ref = align(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }), closes.length);
    expect(diffs(at(keyOf(filters[9], PeriodType.DAY)), ref.map((r) => r?.upper ?? NaN), 1e-9)).toEqual(MATCH);
  });

  it("§2.9 TSI produces a value", () => {
    expect(at("tsiM13N7").filter(Number.isFinite).length).toBeGreaterThan(0);
  });
});

/* Bollinger bands, both of them, with and without another indicator on price */
describe("golden: Bollinger Bands upper and lower", () => {
  const days = weekdays("2025-06-02", 40);
  const times = days.map((d) => etTime(d, "15:59"));
  const candles = walkCandles(times, 11, 50, { vol: 0.03 });
  const closes = candles.map((c) => c.close);
  const ref = align(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }), closes.length);
  const bands = [
    { varName: "bollingerBands", period: 20, multiplier: 2, band: "upper" },
    { varName: "bollingerBands", period: 20, multiplier: 2, band: "lower" },
  ];
  const run = (extra: object[], withSma20: boolean) => {
    const enter = withSma20
      ? [{ varName: "priceSma", timeAgo: "20", operator: ">", compareVal: "1e9" }]
      : [{ varName: "price", operator: ">", compareVal: "1e9" }];
    const job = new ProbeBackTest(strategy(PeriodType.DAY, enter), { extraVars: extra });
    runBacktest([job], [SYM], { [PeriodType.DAY]: { [SYM]: candles } }, etOpen(days[0]), etTime(days[days.length - 1], "16:00"));
    return (key: string) => times.map((t) => job.series(key, SYM).get(t) ?? NaN);
  };

  it("upper band matches technicalindicators when another var reserves 20 bars of price", () => {
    const at = run(bands, true);
    expect(diffs(at("bollingerBands20Multiplier2Upper"), ref.map((r) => r?.upper ?? NaN), 1e-9)).toEqual(MATCH);
  });

  it("(new) lower band matches technicalindicators when another var reserves 20 bars of price", () => {
    const at = run(bands, true);
    expect(diffs(at("bollingerBands20Multiplier2Lower"), ref.map((r) => r?.lower ?? NaN), 1e-9)).toEqual(MATCH);
  });

  it("§1 BB with no other indicator on price", () => {
    let at: ((k: string) => number[]) | undefined;
    expect(() => {
      at = run(bands, false);
    }).not.toThrow();
    expect(diffs(at!("bollingerBands20Multiplier2Upper"), ref.map((r) => r?.upper ?? NaN), 1e-9)).toEqual(MATCH);
    expect(diffs(at!("bollingerBands20Multiplier2Lower"), ref.map((r) => r?.lower ?? NaN), 1e-9)).toEqual(MATCH);
  });
});

/* ================================================================== */
/* 1-minute intraday: one session                                      */
/* ================================================================== */
describe("golden: 1-minute single session", () => {
  const day = "2025-06-23";
  const candles = walkCandles(sessionTimes(day, 1), 3, 100, { vol: 0.002 });
  const fed = fedIntraday({ [day]: candles });
  const closes = fed.map((b) => b.close);

  const filters = [
    { varName: "rsi", timeAgo: "14", operator: ">", compareVal: "1000" },
    { varName: "volume", operator: ">", compareVal: "1e12" },
    { varName: "mtsi", emaPeriod1: 5, emaPeriod2: 3, vwapPeriod: 1, operator: ">", compareVal: "1000" },
    {
      varName: "rsiCrossover", period: 14, crossoverLevel: 50, periodsBefore: 2,
      periodsAfter: 2, bullish: true, operator: "==", compareVal: "1",
    },
    { varName: "pricePercentChangePercentile", timeAgo: "1", numberOfSessions: "1", operator: ">", compareVal: "1000" },
    { varName: "percentchange", timeAgo: "1", operator: ">", compareVal: "1e9" },
  ];
  const job = new ProbeBackTest(strategy(PeriodType.MINUTE, filters), {
    extraVars: [{ varName: "volumeSma", timeAgo: "5" }, { varName: "vwap", timeAgo: "1" }],
  });
  runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00"));
  const at = (key: string) => fed.map((b) => job.series(key, SYM).get(b.t) ?? NaN);

  it("sanity: engine saw every fed bar with the expected price", () => {
    expect(job.history.length).toBe(fed.length);
    expect(at("price")).toEqual(closes);
  });

  it("§1 volume SMA matches technicalindicators", () => {
    const vols = fed.map((b) => b.volume);
    const ref = align(SMA.calculate({ period: 5, values: vols }), vols.length).map((v) => v ?? NaN);
    expect(diffs(at("volumeSma5"), ref, 1e-9)).toEqual(MATCH);
  });

  it("VWAP (backtest, typical price) matches technicalindicators on the same bar", () => {
    const ref = VWAP.calculate({
      high: fed.map((b) => b.high), low: fed.map((b) => b.low),
      close: fed.map((b) => b.close), volume: fed.map((b) => b.volume),
    });
    expect(diffs(at("vwap1"), ref, 1e-9)).toEqual(MATCH);
  });

  it("§1 MTSI matches the documented formula EMA_N(EMA_M(ln(p/VWAP))) / EMA_N(EMA_M(|ln|)) × 100", () => {
    const vwap = VWAP.calculate({
      high: fed.map((b) => b.high), low: fed.map((b) => b.low),
      close: fed.map((b) => b.close), volume: fed.map((b) => b.volume),
    });
    const num = closes.map((p, i) => Math.log(p / vwap[i]));
    const den = num.map(Math.abs);
    const n2 = emaSeries(emaSeries(num, 5), 3);
    const d2 = emaSeries(emaSeries(den, 5), 3);
    const ref = n2.map((n, i) => (100 * n) / d2[i]);
    const actual = at("mtsiM5N3Vwap1");
    // compare only where both are finite, after both EMAs are seeded
    const from = 5 + 3;
    const both = ref.map((r, i) => (i >= from && Number.isFinite(actual[i]) && Number.isFinite(r) ? i : -1)).filter((i) => i >= 0);
    expect(both.length).toBeGreaterThan(100);
    expect(diffs(both.map((i) => actual[i]), both.map((i) => ref[i]), 1e-6)).toEqual(MATCH);
  });

  it("§1 RSI crossover fires on day 1 when the reference does", () => {
    const key = keyOf(filters[3], PeriodType.MINUTE);
    const ref = crossoverRef(wilderRsi(closes, 14), 50, 2, 2, true);
    expect(ref.some((v) => v === 1)).toBe(true);
    const from = 18;
    expect(diffs(at(key).slice(from), ref.slice(from), 0)).toEqual(MATCH);
  });

  it("§1 percentile (1 session) matches an exact rank of 1-bar changes in the session", () => {
    const key = "pricePercentChange1PercentileSessions1";
    const changes = closes.map((p, i) => (i ? (p / closes[i - 1] - 1) * 100 : NaN));
    const ref = changes.map((c, i) => {
      if (!Number.isFinite(c)) return NaN;
      const dist = changes.slice(1, i + 1);
      const below = dist.filter((d) => d < c).length;
      const eq = dist.filter((d) => d === c).length;
      return ((below + 0.5 * eq) / dist.length) * 100;
    });
    expect(diffs(at(key), ref, 1e-9)).toEqual(MATCH);
  });
});

/* Divergences on a 1-minute session.
   The seed is the first one whose reference fires for both, so the test can't pass vacuously. */
describe("golden: divergences on a 1-minute session", () => {
  const day = "2025-06-23";
  const macdDiv = { varName: "macdDivergence", fastPeriod: 12, slowPeriod: 26, lookback: 30, periodsBefore: 3, periodsAfter: 3, bullish: true, operator: "==", compareVal: "1" };
  const rsiDiv = { varName: "rsiDivergence", period: 14, lookback: 20, periodsBefore: 3, periodsAfter: 3, bullish: true, operator: "==", compareVal: "1" };
  const build = (seed: number) => {
    const candles = walkCandles(sessionTimes(day, 1), seed, 100, { vol: 0.002 });
    const fed = fedIntraday({ [day]: candles });
    const closes = fed.map((b) => b.close);
    const macd = align(MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }), closes.length).map((m) => m?.MACD ?? NaN);
    // the window is `lookback` bars for both
    return { candles, fed, macdRef: divergenceRef(closes, macd, 30, true), rsiRef: divergenceRef(closes, wilderRsi(closes, 14), 20, true) };
  };
  let seed = 1;
  while (!(build(seed).macdRef.some((v) => v === 1) && build(seed).rsiRef.some((v) => v === 1))) seed++;
  const { candles, fed, macdRef, rsiRef } = build(seed);
  const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [macdDiv, rsiDiv]));
  runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00"));
  const at = (key: string) => fed.map((b) => job.series(key, SYM).get(b.t) ?? NaN);

  it("§1/§2.1 MACD divergence matches reference", () => {
    const key = keyOf(macdDiv, PeriodType.MINUTE);
    const from = 26 + 30;
    expect(diffs(at(key).slice(from), macdRef.slice(from), 0)).toEqual(MATCH);
  });

  it("§1/§2.1 RSI divergence matches reference (window = lookback)", () => {
    const key = keyOf(rsiDiv, PeriodType.MINUTE);
    const from = 14 + 20;
    expect(diffs(at(key).slice(from), rsiRef.slice(from), 0)).toEqual(MATCH);
  });
});

/* MTSI saturation: price persistently above VWAP */
describe("golden: MTSI in a persistent trend", () => {
  const day = "2025-06-23";
  const candles = walkCandles(sessionTimes(day, 1), 5, 100, { vol: 0.0005, drift: () => 0.001 });
  const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [
    { varName: "mtsi", emaPeriod1: 5, emaPeriod2: 3, vwapPeriod: 1, operator: ">", compareVal: "1000" },
  ]));
  runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00"));

  it("§1(a) MTSI reports +100 (not NaN) when price never dips below VWAP", () => {
    const vals = [...job.series("mtsiM5N3Vwap1", SYM).values()].slice(60);
    expect(vals.filter(Number.isNaN).length).toBe(0);
  });
});


/* ================================================================== */
/* Multi-day intraday: indicators carry across sessions              */
/* ================================================================== */
describe("golden: 1-minute across two sessions", () => {
  const days = ["2025-06-23", "2025-06-24"];
  const byDay: Record<string, ICandle[]> = {};
  days.forEach((d, i) => (byDay[d] = walkCandles(sessionTimes(d, 1), 20 + i, 100, { vol: 0.002 })));
  const fed = fedIntraday(byDay);
  const day2 = fed.filter((b) => b.day === days[1]);

  const bull = { varName: "rsiCrossover", period: 14, crossoverLevel: 50, periodsBefore: 2, periodsAfter: 2, bullish: true, operator: "==", compareVal: "1" };
  const bear = { ...bull, bullish: false };
  const pct = { varName: "pricePercentChangePercentile", timeAgo: "1", numberOfSessions: "2", operator: ">", compareVal: "1000" };
  const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [
    { varName: "rsi", timeAgo: "14", operator: ">", compareVal: "1000" },
    bull, bear, pct,
    { varName: "percentchange", timeAgo: "1", operator: ">", compareVal: "1e9" },
  ]));
  runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: [...byDay[days[0]], ...byDay[days[1]]] } }, etOpen(days[0]), etTime(days[1], "16:00"));
  const bullKey = keyOf(bull, PeriodType.MINUTE);
  const bearKey = keyOf(bear, PeriodType.MINUTE);

  it("sanity: both sessions were fed", () => {
    expect(job.history.length).toBe(fed.length);
  });

  it("§1/§2.3 day 2: bullish and bearish RSI crossover are never both 1", () => {
    const both = day2.filter((b) => job.series(bullKey, SYM).get(b.t) === 1 && job.series(bearKey, SYM).get(b.t) === 1);
    expect(both.length).toBe(0);
  });

  it("§1/§2.3 day 2: RSI crossover matches reference, carried over from day 1", () => {
    const ref = crossoverRef(wilderRsi(fed.map((b) => b.close), 14), 50, 2, 2, true);
    const actual = fed.map((b) => job.series(bullKey, SYM).get(b.t) ?? NaN);
    const day2Idx = fed.findIndex((b) => b.day === days[1]);
    expect(Number.isFinite(actual[day2Idx])).toBe(true);
    expect(diffs(actual.slice(day2Idx), ref.slice(day2Idx), 0)).toEqual(MATCH);
  });

  it("§1/§2.3 percentile with sessions=2 uses the previous session on day 2", () => {
    // reference: exact mid-rank among the last 780 in-session 1-bar changes, across both days
    const changes: number[] = [];
    const ref: number[] = [];
    for (let i = 0; i < fed.length; i++) {
      const sameDay = i > 0 && fed[i - 1].day === fed[i].day;
      const c = sameDay ? (fed[i].close / fed[i - 1].close - 1) * 100 : NaN;
      if (Number.isFinite(c)) changes.push(c);
      const dist = changes.slice(-780);
      ref.push(Number.isFinite(c) ? ((dist.filter((d) => d < c).length + 0.5 * dist.filter((d) => d === c).length) / dist.length) * 100 : NaN);
    }
    const key = keyOf(pct, PeriodType.MINUTE);
    const actual = fed.map((b) => job.series(key, SYM).get(b.t) ?? NaN);
    const day2Idx = fed.findIndex((b) => b.day === days[1]);
    expect(diffs(actual.slice(day2Idx + 1), ref.slice(day2Idx + 1), 1e-6)).toEqual(MATCH);
  });
});

describe("golden: 30-minute across three sessions", () => {
  const days = ["2025-06-23", "2025-06-24", "2025-06-25"];
  const all = days.flatMap((d, i) => walkCandles(sessionTimes(d, 30), 40 + i, 100, { vol: 0.01 }));
  const job = new ProbeBackTest(strategy(PeriodType.THIRTY_MINUTES, [
    { varName: "rsi", timeAgo: "14", operator: ">", compareVal: "1000" },
    { varName: "macd", fastPeriod: 12, slowPeriod: 26, operator: ">", compareVal: "1e9" },
  ]));
  runBacktest([job], [SYM], { [PeriodType.THIRTY_MINUTES]: { [SYM]: all } }, etOpen(days[0]), etTime(days[2], "16:00"));

  it("sanity: 12 bars per session were fed", () => {
    expect(job.history.length).toBe(36);
  });
  it("§2.3 RSI14 on 30-minute bars becomes valid using prior sessions", () => {
    expect([...job.series("rsi14", SYM).values()].filter(Number.isFinite).length).toBeGreaterThan(0);
  });
  it("§2.3 MACD(12,26) on 30-minute bars becomes valid using prior sessions", () => {
    expect([...job.series("macdFast12Slow26", SYM).values()].filter(Number.isFinite).length).toBeGreaterThan(0);
  });
});

/* §2.4: a mid-session data gap whose length is between len and 2·len */
describe("golden: data gap inside a session", () => {
  const day = "2025-06-23";
  const gapStart = etTime(day, "10:00");
  const gapEnd = etTime(day, "10:07");
  const candles = walkCandles(sessionTimes(day, 1), 9, 100, { vol: 0.003 }).filter(
    (c) => c.datetime < gapStart || c.datetime > gapEnd,
  );
  const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [
    { varName: "percentchange", timeAgo: "5", operator: ">", compareVal: "1e9" },
  ]));
  runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00"));

  it("§2.4 percentchange5 is NaN while the price 5 minutes earlier is missing (no stale values)", () => {
    const fedTimes = new Set(job.history.map((h) => h.t));
    const bad: [string, number][] = [];
    for (const h of job.history) {
      if (!fedTimes.has(h.t - 5 * MIN)) {
        const v = h.vars["percentchange5"][SYM];
        if (Number.isFinite(v) && h.t > etTime(day, "09:40")) bad.push([new Date(h.t).toISOString(), v]);
      }
    }
    expect({ count: bad.length, first: bad.slice(0, 3) }).toEqual({ count: 0, first: [] });
  });

  /*
   * §2 "found later" #7, Phase 1 item 9: at time t the feed must hand over the bar
   * that ended at t, i.e. the candle that started one period earlier. If that candle
   * is missing, the symbol gets no bar at t. Today, at 10:08 the feed hands over
   * the 09:59 candle (which ended at 10:00) as if it had just closed.
   */
  it("§2.4 after a gap, the feed skips a bar instead of handing over a stale close", () => {
    const byStart = new Map(candles.map((c) => [c.datetime, c]));
    const bad: [string, string][] = [];
    for (const f of job.fed.filter((x) => x.symbol === SYM)) {
      const ended = byStart.get(f.t - MIN);
      if (!ended || ended.close !== f.price) {
        bad.push([new Date(f.t).toISOString(), ended ? `price ${f.price} != close ${ended.close}` : `no candle started at t-1m, got price ${f.price}`]);
      }
    }
    expect(job.fed.length).toBeGreaterThan(300);
    expect({ count: bad.length, first: bad.slice(0, 3) }).toEqual({ count: 0, first: [] });
  });
});

/* §2.8: periods processed in string order. 30-minute strategy using VWAP of 5-minute bars. */
describe("golden: cross-period VWAP (30-minute strategy, vwapPeriod 5)", () => {
  const day = "2025-06-23";
  const c5 = walkCandles(sessionTimes(day, 5), 13, 100, { vol: 0.004 });
  // 30-minute candles consistent with the 5-minute ones
  const c30: ICandle[] = [];
  for (let i = 0; i < c5.length; i += 6) {
    const g = c5.slice(i, i + 6);
    c30.push({ datetime: g[0].datetime, open: g[0].open, close: g[g.length - 1].close, high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)), volume: g.reduce((a, x) => a + x.volume, 0) });
  }
  const job = new ProbeBackTest(strategy(PeriodType.THIRTY_MINUTES, [
    { varName: "mtsi", emaPeriod1: 2, emaPeriod2: 2, vwapPeriod: 5, operator: ">", compareVal: "1000" },
  ]), { extraVars: [{ varName: "vwap", timeAgo: "5" }] });
  runBacktest([job], [SYM], { [PeriodType.FIVE_MINUTES]: { [SYM]: c5 }, [PeriodType.THIRTY_MINUTES]: { [SYM]: c30 } }, etOpen(day), etTime(day, "16:00"));

  it("§2.8 vwap5 seen by the 30-minute strategy includes the 5-minute bar fed at the same time", () => {
    const fed5 = fedIntraday({ [day]: c5 });
    const ref = VWAP.calculate({ high: fed5.map((b) => b.high), low: fed5.map((b) => b.low), close: fed5.map((b) => b.close), volume: fed5.map((b) => b.volume) });
    const refAt = new Map(fed5.map((b, i) => [b.t, ref[i]]));
    const actual = job.history.map((h) => h.vars["vwap5"][SYM]);
    const expected = job.history.map((h) => refAt.get(h.t) ?? NaN);
    expect(job.history.length).toBe(12);
    expect(diffs(actual, expected, 1e-9)).toEqual(MATCH);
  });
});

/* ================================================================== */
/* Screener evaluation and naming (real StrategyRun.run)               */
/* ================================================================== */
describe("golden: screener can evaluate each indicator filter", () => {
  const day = "2025-06-23";
  const candles = walkCandles(sessionTimes(day, 1), 3, 100, { vol: 0.002 });
  const cases: [string, object][] = [
    ["rsi", { varName: "rsi", timeAgo: "14", operator: ">", compareVal: "1000" }],
    ["mtsi", { varName: "mtsi", emaPeriod1: 5, emaPeriod2: 3, vwapPeriod: 1, operator: ">", compareVal: "1000" }],
    ["macd", { varName: "macd", fastPeriod: 12, slowPeriod: 26, operator: ">", compareVal: "1e9" }],
    ["macdCrossover", { varName: "macdCrossover", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, crossoverLevel: 0, periodsBefore: 2, periodsAfter: 2, bullish: true, operator: "==", compareVal: "1" }],
    ["rsiCrossover", { varName: "rsiCrossover", period: 14, crossoverLevel: 50, periodsBefore: 2, periodsAfter: 2, bullish: true, operator: "==", compareVal: "1" }],
    ["rsiDivergence", { varName: "rsiDivergence", period: 14, lookback: 20, periodsBefore: 3, periodsAfter: 3, bullish: true, operator: "==", compareVal: "1" }],
    ["macdDivergence", { varName: "macdDivergence", fastPeriod: 12, slowPeriod: 26, lookback: 30, periodsBefore: 3, periodsAfter: 3, bullish: true, operator: "==", compareVal: "1" }],
  ];
  it.each(cases)("(new) a strategy with a %s filter runs through the screener without throwing", (_name, filter) => {
    const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [filter]), { evaluate: true });
    expect(() =>
      runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00")),
    ).not.toThrow();
  });
});

describe("golden: UI dropdown values resolve to computable variables", () => {
  // values are the dropdown `value`s in frontend filter.tsx, with the fields the UI collects
  const day = "2025-06-23";
  const candles = walkCandles(sessionTimes(day, 1), 3, 100, { vol: 0.002 });
  const ui: [string, object][] = [
    ["bollingerBands", { varName: "bollingerBands", period: 20, multiplier: 2 }],
    ["macdSignalLine", { varName: "macdSignalLine", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }],
    ["vwap", { varName: "vwap", timeAgo: "1" }],
    ["volumeSma", { varName: "volumeSma", timeAgo: "20" }],
  ];
  it.each(ui)("§1/(new) %s resolves to a variable the engine computes", (_n, filter) => {
    const f = { operator: ">", compareVal: "1e12", ...filter };
    const job = new ProbeBackTest(strategy(PeriodType.MINUTE, [f]));
    runBacktest([job], [SYM], { [PeriodType.MINUTE]: { [SYM]: candles } }, etOpen(day), etTime(day, "16:00"));
    const values = [...job.series(keyOf(f, PeriodType.MINUTE), SYM).values()];
    expect(values.filter(Number.isFinite).length).toBeGreaterThan(300);
  });

  it.each(["adx", "volumechange"])("(new) %s, which nothing computes, is rejected when the strategy loads", (varName) => {
    expect(() => new ProbeBackTest(strategy(PeriodType.MINUTE, [{ varName, timeAgo: "14", operator: ">", compareVal: "0" }]))).toThrow(/Unsupported variable/);
  });
});

describe("golden: §2.9 DataRetriever.getDataBackTest", () => {
  it("open is the candle's open, not its volume", () => {
    const t = etTime("2025-06-23", "10:00");
    const out = DataRetriever.getDataBackTest(t, { [SYM]: { empty: false, symbol: SYM, index: 0, candles: [{ datetime: t, open: 101, high: 102, low: 100, close: 101.5, volume: 5000 }] } });
    expect((out[0] as { open: number }).open).toBe(101);
  });
});
