import {
  FAILURES_BEFORE_ALERT,
  SKIPS_BEFORE_ALERT,
  ITickJob,
  StrategyScheduler,
  TICK_DELAY_MS,
} from "../../run/strategy-scheduler";
import { marketData } from "../../providers/market-data";
import { EASTERN, zonedTime } from "../../providers/candles";

import { AlertOutbox } from "../../notify/alert-outbox";

jest.mock("../../providers/market-data");
jest.mock("../../notify/alert-outbox");

const MINUTE = 60_000;
/** `hhmm` on `date` in New York, whichever offset applies that day. */
const etTime = (date: string, hhmm: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return zonedTime({ year, month, day, hour, minute }, EASTERN);
};
const isMarketOpen = jest.fn();

describe("StrategyScheduler", () => {
  let scheduler: StrategyScheduler;
  let run: jest.Mock;
  let job: ITickJob;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  /** Start the scheduler just after the previous minute's tick, so the next tick is for `hhmm` on `date` (Eastern). */
  const startBefore = (date: string, hhmm: string) => {
    jest.setSystemTime(etTime(date, hhmm) - MINUTE + TICK_DELAY_MS + 1);
    scheduler.scheduleStrategies(job);
  };
  /** Advance past `minutes` more ticks. */
  const advanceMinutes = (minutes: number) => jest.advanceTimersByTimeAsync(minutes * MINUTE);
  const ranAt = () => run.mock.calls.map(([t]) => t);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (marketData as jest.Mock).mockReturnValue({ isMarketOpen });
    isMarketOpen.mockReset().mockResolvedValue(true);
    run = jest.fn().mockResolvedValue(undefined);
    job = { run };
    scheduler = new StrategyScheduler();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    scheduler.stopAll();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("runs at the start of each session minute, passing the minute's start", async () => {
    startBefore("2026-11-23", "10:01");
    await advanceMinutes(3);
    expect(ranAt()).toEqual([
      etTime("2026-11-23", "10:01"),
      etTime("2026-11-23", "10:02"),
      etTime("2026-11-23", "10:03"),
    ]);
  });

  it("runs from 9:30 through 15:59 Eastern and not outside it", async () => {
    startBefore("2026-11-23", "09:29");
    await advanceMinutes(2);
    expect(ranAt()).toEqual([etTime("2026-11-23", "09:30")]);

    scheduler.stopAll();
    run.mockClear();
    startBefore("2026-11-23", "15:59");
    await advanceMinutes(3);
    expect(ranAt()).toEqual([etTime("2026-11-23", "15:59")]);
  });

  it.each([
    ["standard time", "2026-03-06"],
    ["daylight time", "2026-03-09"],
  ])("opens at 9:30 Eastern in %s", async (_name, date) => {
    startBefore(date, "09:30");
    await advanceMinutes(1);
    expect(ranAt()).toEqual([etTime(date, "09:30")]);
  });

  it("doesn't run or ask whether the market is open at the weekend", async () => {
    startBefore("2026-11-21", "10:00");
    await advanceMinutes(5);
    expect(run).not.toHaveBeenCalled();
    expect(isMarketOpen).not.toHaveBeenCalled();
  });

  it("asks whether the market is open once a day, and again the next day", async () => {
    startBefore("2026-11-23", "10:00");
    await advanceMinutes(10);
    expect(run).toHaveBeenCalledTimes(10);
    expect(isMarketOpen).toHaveBeenCalledTimes(1);

    scheduler.stopAll();
    startBefore("2026-11-24", "10:00");
    await advanceMinutes(2);
    expect(isMarketOpen).toHaveBeenCalledTimes(2);
  });

  it("on a closed day doesn't run, asks each minute, and logs the answer once", async () => {
    isMarketOpen.mockResolvedValue(false);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    startBefore("2026-11-26", "10:00");
    await advanceMinutes(3);
    expect(isMarketOpen).toHaveBeenCalledTimes(3);
    expect(run).not.toHaveBeenCalled();
    expect(log.mock.calls.filter(([m]) => String(m).includes("market closed"))).toHaveLength(1);
  });

  it("a closed answer at 9:30 costs one minute, not the day", async () => {
    isMarketOpen.mockResolvedValueOnce(false).mockResolvedValue(true);
    startBefore("2026-11-23", "09:30");
    await advanceMinutes(3);
    expect(ranAt()).toEqual([etTime("2026-11-23", "09:31"), etTime("2026-11-23", "09:32")]);
  });

  it("retries a failed market-open check the next minute", async () => {
    isMarketOpen.mockRejectedValueOnce(new Error("Schwab is down")).mockResolvedValue(true);
    startBefore("2026-11-23", "09:30");
    await advanceMinutes(2);
    expect(isMarketOpen).toHaveBeenCalledTimes(2);
    expect(ranAt()).toEqual([etTime("2026-11-23", "09:31")]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed (1 in a row)"), expect.any(Error));
  });

  it("keeps running after a tick fails", async () => {
    run.mockRejectedValueOnce(new Error("quotes failed")).mockResolvedValue(undefined);
    startBefore("2026-11-23", "10:00");
    await advanceMinutes(3);
    expect(run).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("the tick at 2026-11-23T15:00:00.000Z failed"),
      expect.objectContaining({ message: "quotes failed" }),
    );
  });

  it("sends one alert when ticks keep failing, and another when they recover", async () => {
    for (let i = 0; i < FAILURES_BEFORE_ALERT + 2; i++) run.mockRejectedValueOnce(new Error("down"));
    startBefore("2026-11-23", "10:00");
    await advanceMinutes(FAILURES_BEFORE_ALERT + 3);
    expect((AlertOutbox.enqueue as jest.Mock).mock.calls.map(([a]) => a)).toEqual([
      {
        kind: "system",
        subject: "Live runs aren't getting data",
        body: expect.stringContaining("Latest error: down"),
        dedupKey: `ticks-failing:${etTime("2026-11-23", "10:04")}`,
      },
      { kind: "system", subject: "Live runs recovered", body: expect.stringContaining("after 7 failed minutes") },
    ]);
  });

  describe("a tick still running when the next minute starts", () => {
    let active: number;
    let maxActive: number;
    /** Ticks for the given minutes take `ms`; the rest finish at once. */
    const slow = (ms: number, ...minutes: string[]) =>
      run.mockImplementation(async (t: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (minutes.some((m) => etTime("2026-11-23", m) === t)) await new Promise((r) => setTimeout(r, ms));
        active -= 1;
      });

    beforeEach(() => {
      active = 0;
      maxActive = 0;
    });

    it("makes that minute wait and run as soon as it finishes", async () => {
      slow(1.5 * MINUTE, "10:00");
      startBefore("2026-11-23", "10:00");
      await advanceMinutes(3);
      expect(ranAt()).toEqual(["10:00", "10:01", "10:02"].map((m) => etTime("2026-11-23", m)));
      expect(maxActive).toBe(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("2026-11-23T15:01:00.000Z waits"));
    });

    it("keeps only the latest waiting minute", async () => {
      slow(2.5 * MINUTE, "10:00");
      startBefore("2026-11-23", "10:00");
      await advanceMinutes(4);
      expect(ranAt()).toEqual(["10:00", "10:02", "10:03"].map((m) => etTime("2026-11-23", m)));
      expect(maxActive).toBe(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("2026-11-23T15:01:00.000Z didn't run"));
    });

    it("doesn't lose the 15:59 DAY tick to a slow 15:58", async () => {
      slow(70_000, "15:58");
      startBefore("2026-11-23", "15:58");
      await advanceMinutes(3);
      expect(ranAt()).toEqual(["15:58", "15:59"].map((m) => etTime("2026-11-23", m)));
    });

    it("logs an error once when a tick seems stuck", async () => {
      run.mockReturnValue(new Promise(() => undefined));
      startBefore("2026-11-23", "10:00");
      await advanceMinutes(SKIPS_BEFORE_ALERT + 3);
      expect(run).toHaveBeenCalledTimes(1);
      expect(error.mock.calls.filter(([m]) => String(m).includes("may be stuck"))).toHaveLength(1);
      expect(AlertOutbox.enqueue).toHaveBeenCalledTimes(1);
      expect(AlertOutbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ subject: "Live runs may be stuck" }));
    });

    it("stopAll during a tick drops the waiting minute", async () => {
      slow(1.5 * MINUTE, "10:00");
      startBefore("2026-11-23", "10:00");
      await advanceMinutes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("2026-11-23T15:01:00.000Z waits"));
      scheduler.stopAll();
      await advanceMinutes(3);
      expect(ranAt()).toEqual([etTime("2026-11-23", "10:00")]);
    });
  });

  it("started in the first second of a minute, still runs that minute", async () => {
    jest.setSystemTime(etTime("2026-11-23", "10:00") + 500);
    scheduler.scheduleStrategies(job);
    await jest.advanceTimersByTimeAsync(TICK_DELAY_MS);
    expect(ranAt()).toEqual([etTime("2026-11-23", "10:00")]);
  });

  it("stopAll stops the ticks", async () => {
    startBefore("2026-11-23", "10:00");
    await advanceMinutes(1);
    scheduler.stopAll();
    await advanceMinutes(5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("scheduling again replaces the job instead of running both", async () => {
    const other = jest.fn().mockResolvedValue(undefined);
    startBefore("2026-11-23", "10:00");
    scheduler.scheduleStrategies({ run: other });
    await advanceMinutes(2);
    expect(run).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(2);
  });
});
