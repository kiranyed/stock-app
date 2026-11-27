import { CONSTANTS } from "../shared/constants";
import { marketData } from "../providers/market-data";
import { EASTERN, wallClock } from "../providers/candles";
import { AlertOutbox } from "../notify/alert-outbox";

/** What the scheduler runs once a minute: the live master job. */
export interface ITickJob {
  /** `time` is the start of the minute (ms), the same time a back test uses for that bar. */
  run(time: number): Promise<void> | void;
}

const { MILLIS_IN_MINUTE, BEGIN_TIME, END_TIME } = CONSTANTS;

/** Fire this long after each minute boundary, so the last trades of the minute are in the quotes. */
export const TICK_DELAY_MS = 1000;
/** After this many failed ticks in a row, log an error that says ticks keep failing. */
export const FAILURES_BEFORE_ALERT = 5;
/** After this many minutes in a row skipped because a tick is still running, log an error. */
export const SKIPS_BEFORE_ALERT = 5;

const minuteStart = (t: number) => t - (t % MILLIS_IN_MINUTE);

/**
 * Runs the live master job at the start of every minute of the regular session (9:30–16:00
 * Eastern) on days the market is open.
 *
 * - One timer, set for the next minute boundary each time it fires, so ticks stay on the
 *   minute and don't drift. Daylight saving needs no handling: minutes are the same in every zone.
 * - A tick that throws is logged and the next minute runs as usual (PRODUCTION-READINESS.md §2.5).
 *   After {@link FAILURES_BEFORE_ALERT} failures in a row it sends an alert, and another on recovery.
 * - Two ticks never run at once (§2.6). If the previous tick is still running when a minute starts,
 *   that minute waits and runs as soon as it finishes, so a slow 15:58 doesn't lose the day's DAY
 *   bar. Only the latest waiting minute is kept; any it replaces are logged as not run.
 * - The market-open check is made on the first minute of the session each day. A failed or
 *   "closed" answer is asked again the next minute, so a status that's a moment late at 9:30
 *   costs one minute, not the day.
 */
export class StrategyScheduler {
  private job?: ITickJob;
  private timer?: NodeJS.Timeout;
  private running = false;
  /** The latest minute that started while a tick was running; it runs when that tick finishes. */
  private waiting?: number;
  private lastTick?: number;
  private failures = 0;
  private skips = 0;
  /** The last market-open answer and the Eastern date it was for. Only "open" is kept for the day. */
  private marketDay?: { date: string; open: boolean };

  /** Start running `job` every minute. Replaces any job already scheduled. */
  scheduleStrategies(job: ITickJob) {
    this.stopAll();
    this.job = job;
    this.lastTick = undefined;
    this.failures = 0;
    this.skips = 0;
    this.scheduleNext();
  }

  /** Stop ticking. A tick already running finishes. */
  stopAll() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.job = undefined;
    this.waiting = undefined;
  }

  private scheduleNext() {
    const now = Date.now();
    let next = minuteStart(now) + TICK_DELAY_MS;
    if (next <= now) next += MILLIS_IN_MINUTE;
    this.timer = setTimeout(() => this.onTimer(), next - now);
    // a live run alone shouldn't keep the process (or a test) from exiting
    this.timer.unref?.();
  }

  private onTimer() {
    const job = this.job;
    if (!job) return;
    this.scheduleNext();
    this.start(job, minuteStart(Date.now()));
  }

  private start(job: ITickJob, time: number) {
    this.tick(job, time).catch((err) => console.error("[StrategyScheduler] tick failed unexpectedly", err));
  }

  private async tick(job: ITickJob, time: number) {
    const clock = wallClock(time, EASTERN);
    const minute = clock.hour * 60 + clock.minute;
    const weekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay();
    if (weekday === 0 || weekday === 6 || minute < BEGIN_TIME || minute >= END_TIME) return;

    if (this.running) {
      if (this.waiting !== undefined) {
        console.warn(`[StrategyScheduler] ${iso(this.waiting)} didn't run: the minutes before it were still running`);
      }
      this.waiting = time;
      this.skips += 1;
      console.warn(`[StrategyScheduler] ${iso(time)} waits: the previous minute is still running`);
      if (this.skips === SKIPS_BEFORE_ALERT) {
        const text = `${SKIPS_BEFORE_ALERT} minutes in a row started while a live tick was still running (since ${iso(this.lastTick ?? time)}); it may be stuck.`;
        console.error(`[StrategyScheduler] ${text}`);
        void AlertOutbox.enqueue({ kind: "system", subject: "Live runs may be stuck", body: text, dedupKey: `ticks-stuck:${time}` });
      }
      return;
    }
    // set before any await, so a tick started meanwhile sees it
    this.running = true;
    this.skips = 0;
    try {
      const date = `${clock.year}-${clock.month}-${clock.day}`;
      if (!(await this.isMarketOpen(date))) return;

      if (this.lastTick !== undefined && time - this.lastTick > MILLIS_IN_MINUTE && this.sameDay(this.lastTick, date)) {
        const missed = (time - this.lastTick) / MILLIS_IN_MINUTE - 1;
        console.warn(`[StrategyScheduler] ${missed} minute(s) before ${iso(time)} didn't run`);
      }
      this.lastTick = time;

      const started = Date.now();
      await job.run(time);
      const took = Date.now() - started;
      if (took > MILLIS_IN_MINUTE / 2) {
        console.warn(`[StrategyScheduler] the tick at ${iso(time)} took ${took} ms`);
      }
      this.succeeded();
    } catch (err) {
      this.failed(time, err);
    } finally {
      this.running = false;
      const waiting = this.waiting;
      this.waiting = undefined;
      if (waiting !== undefined && this.job === job) {
        console.warn(`[StrategyScheduler] running ${iso(waiting)} late`);
        this.start(job, waiting);
      }
    }
  }

  /** Whether the market is open on `date`: asked until it says open, then kept for the day. Throws if it can't tell. */
  private async isMarketOpen(date: string): Promise<boolean> {
    const known = this.marketDay;
    if (known?.date === date && known.open) return true;
    const open = await marketData().isMarketOpen();
    if (known?.date !== date || known.open !== open) {
      console.log(`[StrategyScheduler] market ${open ? "open" : "closed"} on ${date}`);
    }
    this.marketDay = { date, open };
    return open;
  }

  private sameDay(t: number, date: string) {
    const c = wallClock(t, EASTERN);
    return `${c.year}-${c.month}-${c.day}` === date;
  }

  private succeeded() {
    if (this.failures >= FAILURES_BEFORE_ALERT) {
      const text = `Live runs are getting data again after ${this.failures} failed minutes.`;
      console.error(`[StrategyScheduler] ${text}`);
      void AlertOutbox.enqueue({ kind: "system", subject: "Live runs recovered", body: text });
    }
    this.failures = 0;
  }

  private failed(time: number, err: unknown) {
    this.failures += 1;
    console.error(`[StrategyScheduler] the tick at ${iso(time)} failed (${this.failures} in a row)`, err);
    if (this.failures === FAILURES_BEFORE_ALERT) {
      const reason = err instanceof Error ? err.message : String(err);
      const text = `The last ${FAILURES_BEFORE_ALERT} live minutes failed, so live runs aren't getting data. Latest error: ${reason}`;
      console.error(`[StrategyScheduler] ${text}`);
      void AlertOutbox.enqueue({ kind: "system", subject: "Live runs aren't getting data", body: text, dedupKey: `ticks-failing:${time}` });
    }
  }
}

const iso = (t: number) => new Date(t).toISOString();
