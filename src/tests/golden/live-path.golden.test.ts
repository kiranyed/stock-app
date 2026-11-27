/**
 * Golden live-path tests (REFACTOR.md Phase 1, item 1). No mocks: quote
 * snapshots (cumulative day volume, no high/low, as Schwab quotes arrive) go
 * through LiveMasterJob.handleNewData as LiveJobRunner wires it, minus the
 * network warmup.
 */
import { SMA } from "technicalindicators";
import { PeriodType } from "../../shared/constants";
import { IStockData } from "../../types/data-processing-types";
import {
  MIN,
  ProbeBackTest,
  diffs,
  MATCH,
  etOpen,
  etTime,
  liveTick,
  mulberry32,
  startLive,
  strategy,
} from "./golden-harness";

const SYM = "AAA";

function quoteStream(day: string, minutes: number, seed: number) {
  const rnd = mulberry32(seed);
  let price = 100;
  let cum = 0;
  const out: { t: number; price: number; cum: number; delta: number }[] = [];
  for (let m = 0; m < minutes; m++) {
    price *= 1 + (rnd() - 0.5) * 0.004;
    const delta = Math.round(1000 + rnd() * 9000);
    cum += delta;
    out.push({ t: etOpen(day) + m * MIN, price, cum, delta });
  }
  return out;
}

describe("golden: live 1-minute quotes with cumulative volume", () => {
  const day = "2025-06-23";
  const stream = quoteStream(day, 60, 1);
  const job = new ProbeBackTest(
    strategy(PeriodType.MINUTE, [
      { varName: "volume", operator: ">", compareVal: "1e12" },
      { varName: "mtsi", emaPeriod1: 5, emaPeriod2: 3, vwapPeriod: 1, operator: ">", compareVal: "1000" },
    ]),
    { extraVars: [{ varName: "volumeSma", timeAgo: "3" }, { varName: "vwap", timeAgo: "1" }] },
  );
  const master = startLive([job], [SYM]);
  for (const q of stream) {
    liveTick(master, [job], [{ symbol: SYM, price: q.price, datetime: q.t, volume: q.cum }]);
  }
  const at = (key: string) => stream.map((q) => job.series(key, SYM).get(q.t) ?? NaN);

  it("§2.5 volume var is the per-minute delta of cumulative volume", () => {
    expect(diffs(at("volume"), stream.map((q) => q.delta), 0)).toEqual(MATCH);
  });

  it("§2.5 live VWAP = Σ price·Δvolume / Σ Δvolume", () => {
    let num = 0, den = 0;
    const ref = stream.map((q) => {
      num += q.price * q.delta;
      den += q.delta;
      return num / den;
    });
    expect(diffs(at("vwap1"), ref, 1e-9)).toEqual(MATCH);
  });

  it("§2.5 volumeSma3 is the SMA of per-minute volume, not cumulative volume", () => {
    const deltas = stream.map((q) => q.delta);
    const ref = [NaN, NaN, ...SMA.calculate({ period: 3, values: deltas })];
    expect(diffs(at("volumeSma3"), ref, 1e-9)).toEqual(MATCH);
  });
});

describe("golden: live DAY period timing", () => {
  const day = "2025-06-23";
  const open = 100;
  const close = 110;
  const quotes = (t: number, price: number): IStockData[] => [{ symbol: SYM, price, datetime: t, volume: 1000 }];
  const dayFilter = [{ varName: "priceSma", timeAgo: "2", operator: ">", compareVal: "1e9" }];

  it("§2.6 with an intraday job present, the DAY price is not set from the 9:30 quote", () => {
    const dayJob = new ProbeBackTest(strategy(PeriodType.DAY, dayFilter, undefined, 1));
    const minJob = new ProbeBackTest(strategy(PeriodType.MINUTE, [{ varName: "percentchange", timeAgo: "1", operator: ">", compareVal: "1e9" }], undefined, 2));
    const master = startLive([dayJob, minJob], [SYM]);
    liveTick(master, [dayJob], quotes(etTime(day, "09:30"), open));
    expect(dayJob.history[0].vars["price"][SYM]).not.toBe(open);
  });

  it("§2.6 with an intraday job present, the DAY price is set from the 15:59 quote", () => {
    const dayJob = new ProbeBackTest(strategy(PeriodType.DAY, dayFilter, undefined, 1));
    const minJob = new ProbeBackTest(strategy(PeriodType.MINUTE, [{ varName: "percentchange", timeAgo: "1", operator: ">", compareVal: "1e9" }], undefined, 2));
    const master = startLive([dayJob, minJob], [SYM]);
    liveTick(master, [dayJob], quotes(etTime(day, "15:59"), close));
    expect(dayJob.history[0].vars["price"][SYM]).toBe(close);
  });

  it("§2.6 with only DAY jobs, the 15:59 quote updates the DAY period", () => {
    const dayJob = new ProbeBackTest(strategy(PeriodType.DAY, dayFilter));
    const master = startLive([dayJob], [SYM]);
    liveTick(master, [dayJob], quotes(etTime(day, "15:59"), close));
    expect(dayJob.history[0].vars["price"][SYM]).toBe(close);
  });
});

describe("golden: live multi-user scoping", () => {
  const day = "2025-06-23";

  it("§2.7 a second user's job loads that user's group symbols", () => {
    const jobA = new ProbeBackTest(strategy(PeriodType.MINUTE, [{ varName: "price", operator: ">", compareVal: "1e9" }], undefined, 1));
    const master = startLive([jobA], ["AAA"]);
    // LiveJobRunner's "already initialized" branch for user B (group ["BBB"])
    const jobB = new ProbeBackTest(strategy(PeriodType.FIVE_MINUTES, [{ varName: "price", operator: ">", compareVal: "1e9" }], undefined, 2));
    master.addJobs([jobB], { id: 2, name: "b", symbols: ["BBB"] });
    expect(master.symbolsFor(PeriodType.FIVE_MINUTES)).toEqual(["BBB"]);
    expect(master.symbolsFor(PeriodType.MINUTE)).toEqual(["AAA"]);
  });

  it("§2.7 a strategy only screens symbols from its own group", () => {
    const always = [{ varName: "price", operator: ">", compareVal: "0" }];
    const jobA = new ProbeBackTest(strategy(PeriodType.MINUTE, always, undefined, 1), { evaluate: true });
    const master = startLive([jobA], ["AAA"]);
    const t = etTime(day, "10:00");
    const data: IStockData[] = [
      { symbol: "AAA", price: 50, datetime: t, volume: 100 },
      { symbol: "BBB", price: 60, datetime: t, volume: 100 }, // another user's symbol in the same fetch
    ];
    master.handleNewData(data);
    master.finishJob(data);
    expect(jobA.openPositions()).toEqual(["AAA"]);
  });
});
