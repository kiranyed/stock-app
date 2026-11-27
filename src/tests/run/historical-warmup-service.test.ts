import { BackTestHelper } from "../../back-testing/back-test-helper";
import { HistoricalWarmupService } from "../../run/historical-warmup-service";
import { LiveMasterJob } from "../../shared/classes/live-master-job";
import { PeriodType } from "../../shared/constants";
import { ICandle, ICandleDataMap, ITestConfig } from "../../types/back-test-types";
import {
  ProbeBackTest,
  etTime,
  fedIntraday,
  sessionTimes,
  strategy,
  walkCandles,
  weekdays,
  wilderRsi,
} from "../golden/golden-harness";

const SYM = "AAA";
const group = { id: 1, name: "g", symbols: [SYM] };
// Tuesday 2025-07-15, 12:00 ET
const now = etTime("2025-07-15", "12:00");

const days = weekdays("2025-05-01", 52).filter((d) => d <= "2025-07-15");
const dayCandles = walkCandles(days.map((d) => etTime(d, "15:59")), 1, 100, { vol: 0.02 });
const halfHourByDay: Record<string, ICandle[]> = {};
days.slice(-4).forEach((d, i) => (halfHourByDay[d] = walkCandles(sessionTimes(d, 30), 10 + i, 100, { vol: 0.01 })));
const source: Partial<Record<PeriodType, ICandle[]>> = {
  [PeriodType.DAY]: dayCandles,
  [PeriodType.THIRTY_MINUTES]: Object.values(halfHourByDay).flat(),
};

let requested: { config: ITestConfig; periods: PeriodType[] }[];

beforeEach(() => {
  requested = [];
  jest
    .spyOn(BackTestHelper.prototype, "initCandleData")
    .mockImplementation(async function (this: BackTestHelper, config, periods) {
      requested.push({ config, periods });
      const maps: Partial<Record<PeriodType, ICandleDataMap>> = {};
      for (const p of periods) {
        const candles = (source[p] ?? []).filter((c) => c.datetime >= config.startTime);
        maps[p] = { [SYM]: { empty: false, symbol: SYM, index: 0, candles } };
      }
      (this as unknown as { candleData: typeof maps }).candleData = maps;
      return maps;
    });
});

afterEach(() => jest.restoreAllMocks());

describe("HistoricalWarmupService.warm", () => {
  it("fetches nothing when no indicator needs history", async () => {
    const job = new ProbeBackTest(strategy(PeriodType.DAY, [{ varName: "price", operator: ">", compareVal: "0" }]));
    await HistoricalWarmupService.warm([job], group, now);
    expect(requested).toEqual([]);
  });

  it("warms a DAY SMA from the sessions before today", async () => {
    const job = new ProbeBackTest(strategy(PeriodType.DAY, [{ varName: "priceSma", timeAgo: "20", operator: ">", compareVal: "0" }]));
    const warmed = await HistoricalWarmupService.warm([job], group, now);

    expect(requested[0].periods).toEqual([PeriodType.DAY]);
    const before = dayCandles.filter((c) => c.datetime < now).slice(-20);
    const expected = before.reduce((a, c) => a + c.close, 0) / 20;
    expect(warmed.get(SYM, PeriodType.DAY, "priceSma20")?.value).toBeCloseTo(expected, 9);
  });

  it("warms a 30-minute RSI14 from prior sessions and today's bars so far", async () => {
    const job = new ProbeBackTest(strategy(PeriodType.THIRTY_MINUTES, [{ varName: "rsi", timeAgo: "14", operator: ">", compareVal: "0" }]));
    const warmed = await HistoricalWarmupService.warm([job], group, now);

    const fed = fedIntraday(halfHourByDay).filter((b) => b.t < now);
    const ref = wilderRsi(fed.map((b) => b.close), 14);
    expect(Number.isFinite(ref[ref.length - 1])).toBe(true);
    expect(warmed.get(SYM, PeriodType.THIRTY_MINUTES, "rsi14")?.value).toBeCloseTo(ref[ref.length - 1], 9);
  });

  it("LiveMasterJob.addJobs starts new indicators from the warmed state and carries on live", async () => {
    const job = new ProbeBackTest(strategy(PeriodType.THIRTY_MINUTES, [{ varName: "rsi", timeAgo: "14", operator: ">", compareVal: "0" }]));
    const warmed = await HistoricalWarmupService.warm([job], group, now);
    const master = new LiveMasterJob([], group);
    master.addJobs([job], group, warmed);

    const fed = fedIntraday(halfHourByDay).filter((b) => b.t < now);
    const next = 101.5;
    master.handleNewData([{ symbol: SYM, price: next, datetime: now, volume: 1000 }]);
    const ref = wilderRsi([...fed.map((b) => b.close), next], 14);
    expect(job.getVars()["rsi14"][SYM]).toBeCloseTo(ref[ref.length - 1], 9);
  });
});
