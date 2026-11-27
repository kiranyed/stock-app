// Runs back tests on worker threads, so a long back test doesn't stop the server answering
// requests or running the live minute tick (PRODUCTION-READINESS.md §2.1).

import path from "path";
import { Worker } from "worker_threads";
import { StatusCodes } from "http-status-codes";
import BaseError from "../errors/base-error";
import Error429 from "../errors/error-429";
import { SchwabAuth } from "../providers/schwab/schwab-auth";
import { ISettings, settings } from "../shared/settings";
import {
  BackTestRun,
  BackTestTask,
  FromWorker,
  ToWorker,
  fromWire,
  runBackTestTask,
  toWire,
} from "./back-test-task";

/** The part of `Worker` the pool uses, so tests can pass a fake. */
export interface IBackTestWorker {
  postMessage(message: ToWorker): void;
  on(event: "message", listener: (message: FromWorker) => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
  ref(): void;
  unref(): void;
}

/** Under ts-node or Jest this file is .ts, so the worker loads ts-node first. */
export const startWorker = (): IBackTestWorker => {
  const ext = path.extname(__filename);
  const file = path.join(__dirname, `back-test-worker${ext}`);
  return new Worker(file, ext === ".ts" ? { execArgv: ["--require", "ts-node/register/transpile-only"] } : {});
};

const asError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

interface IQueued {
  task: BackTestTask;
  resolve: (run: BackTestRun) => void;
  reject: (err: Error) => void;
  /** Drops the task if it's still waiting for a worker after `backTestMaxWaitMs`. */
  waitTimer?: NodeJS.Timeout;
}

interface ISlot {
  worker: IBackTestWorker;
  current: IQueued | null;
  timer?: NodeJS.Timeout;
}

type PoolSettings = Pick<ISettings, "backTestWorkers" | "backTestTimeoutMs" | "backTestMaxWaiting" | "backTestMaxWaitMs">;

const unavailable = (message: string) => new BaseError(message, StatusCodes.SERVICE_UNAVAILABLE, true);
const minutes = (ms: number) => {
  const m = +(ms / 60_000).toFixed(1);
  return `${m} minute${m === 1 ? "" : "s"}`;
};

export class BackTestPool {
  private static slots: ISlot[] = [];
  private static queue: IQueued[] = [];
  private static running = new Map<number, number>();
  private static createWorker: () => IBackTestWorker = startWorker;
  /**
   * The settings read by the latest `run` or `start`. Everything after that uses this copy, so
   * a bad value can only fail the call that read it, never a worker event handler.
   */
  private static config: PoolSettings = {
    backTestWorkers: 1,
    backTestTimeoutMs: 0,
    backTestMaxWaiting: 0,
    backTestMaxWaitMs: 0,
  };

  /** Tests: replace how workers are started. */
  static useWorkerFactory(factory: () => IBackTestWorker) {
    this.createWorker = factory;
  }

  /** Starts the workers now, so the first back test doesn't wait for one to load. */
  static start() {
    this.config = settings();
    while (this.slots.length < this.config.backTestWorkers) {
      try {
        this.spawn();
      } catch (err) {
        console.error("[BackTestPool] couldn't start a worker:", asError(err).message);
        return;
      }
    }
  }

  /**
   * Runs `task` on a free worker, waiting in line if all are busy, and returns the results and
   * how long the back test itself took (not counting the wait). Refuses with 429 when the user
   * already has `backTestsPerUser` back tests running or waiting, and with 503 when
   * `backTestMaxWaiting` back tests are already waiting for a worker or this one waits longer
   * than `backTestMaxWaitMs`.
   */
  static run(userId: number, task: BackTestTask): Promise<BackTestRun> {
    let current: ISettings;
    try {
      current = settings();
    } catch (err) {
      return Promise.reject(asError(err));
    }
    this.config = current;
    const count = this.running.get(userId) ?? 0;
    if (current.backTestsPerUser > 0 && count >= current.backTestsPerUser) {
      return Promise.reject(
        new Error429(
          `You already have ${count} back test${count === 1 ? "" : "s"} running. Try again when one finishes.`,
        ),
      );
    }
    this.running.set(userId, count + 1);

    const result =
      current.backTestWorkers === 0
        ? this.runHere(task)
        : new Promise<BackTestRun>((resolve, reject) => this.enqueue({ task, resolve, reject }));
    return result.finally(() => {
      const left = (this.running.get(userId) ?? 1) - 1;
      if (left > 0) this.running.set(userId, left);
      else this.running.delete(userId);
    });
  }

  /** Stops every worker and fails anything still waiting (tests and shutdown). */
  static async close() {
    const slots = this.slots;
    const queued = this.queue;
    this.slots = [];
    this.queue = [];
    const closed = new Error("back tests are shutting down");
    for (const job of queued) {
      clearTimeout(job.waitTimer);
      job.reject(closed);
    }
    for (const slot of slots) {
      clearTimeout(slot.timer);
      slot.current?.reject(closed);
      slot.current = null;
    }
    await Promise.all(slots.map((slot) => slot.worker.terminate().catch(() => undefined)));
  }

  private static async runHere(task: BackTestTask): Promise<BackTestRun> {
    const started = Date.now();
    const results = await runBackTestTask(task);
    return { results, runtimeMs: Date.now() - started };
  }

  /**
   * Hands `job` to a free worker, or puts it in line. The line is capped (`backTestMaxWaiting`)
   * and so is the wait (`backTestMaxWaitMs`), since a client that gave up doesn't cancel its
   * back test and a burst of requests could otherwise build a line nobody is waiting for.
   */
  private static enqueue(job: IQueued) {
    this.queue.push(job);
    this.dispatch();
    if (!this.queue.includes(job)) return; // a worker took it
    const { backTestMaxWaiting, backTestMaxWaitMs } = this.config;
    if (backTestMaxWaiting > 0 && this.queue.length > backTestMaxWaiting) {
      this.remove(job);
      const waiting = this.queue.length;
      job.reject(
        unavailable(`The server already has ${waiting} back test${waiting === 1 ? "" : "s"} waiting. Try again in a minute.`),
      );
      return;
    }
    if (backTestMaxWaitMs > 0) {
      job.waitTimer = setTimeout(() => {
        if (!this.remove(job)) return;
        job.reject(
          unavailable(
            `The back test waited more than ${minutes(backTestMaxWaitMs)} for a free worker and was dropped. Try again later.`,
          ),
        );
      }, backTestMaxWaitMs);
      // a waiting back test doesn't keep the process alive by itself
      job.waitTimer.unref();
    }
  }

  /** Takes `job` out of the line; false if it wasn't there. */
  private static remove(job: IQueued) {
    const index = this.queue.indexOf(job);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    clearTimeout(job.waitTimer);
    return true;
  }

  /** The next waiting task, with its wait deadline cleared. */
  private static next(): IQueued {
    const job = this.queue.shift()!;
    clearTimeout(job.waitTimer);
    return job;
  }

  /** Gives waiting tasks to free workers, starting workers up to the limit. Never throws. */
  private static dispatch() {
    while (this.queue.length) {
      let slot = this.slots.find((s) => !s.current);
      if (!slot) {
        if (this.slots.length >= Math.max(1, this.config.backTestWorkers)) return;
        try {
          slot = this.spawn();
        } catch (err) {
          // no worker for this task (for example the OS refused a thread); try the next one
          this.next().reject(asError(err));
          continue;
        }
      }
      this.assign(slot, this.next());
    }
  }

  private static spawn(): ISlot {
    const slot: ISlot = { worker: this.createWorker(), current: null };
    slot.worker.on("message", (message: FromWorker) => this.onMessage(slot, message));
    slot.worker.on("error", (err: Error) => this.fail(slot, err));
    slot.worker.on("exit", (code: number) => this.fail(slot, new Error(`back test worker stopped (exit code ${code})`)));
    // an idle worker doesn't keep the process alive
    slot.worker.unref();
    this.slots.push(slot);
    return slot;
  }

  private static assign(slot: ISlot, job: IQueued) {
    try {
      // first, so a task that can't be sent (DataCloneError) leaves the slot as it was
      slot.worker.postMessage({ type: "run", task: job.task });
    } catch (err) {
      job.reject(asError(err));
      return;
    }
    slot.current = job;
    slot.worker.ref();
    const { backTestTimeoutMs } = this.config;
    if (backTestTimeoutMs > 0) {
      slot.timer = setTimeout(() => {
        this.fail(
          slot,
          unavailable(
            `The back test ran longer than ${minutes(backTestTimeoutMs)} and was stopped. Try a shorter time range or fewer symbols.`,
          ),
        );
      }, backTestTimeoutMs);
    }
  }

  private static onMessage(slot: ISlot, message: FromWorker) {
    if (message.type === "token") {
      const { id } = message;
      (message.force ? SchwabAuth.forceRefresh() : SchwabAuth.getAccessToken()).then(
        (token) => this.reply(slot, { type: "token", id, token }),
        (err) => this.reply(slot, { type: "token", id, error: toWire(err) }),
      );
      return;
    }
    const job = slot.current;
    if (!job) return; // a late answer for a task that already failed
    clearTimeout(slot.timer);
    slot.current = null;
    slot.worker.unref();
    if (message.type === "done") job.resolve({ results: message.results, runtimeMs: message.runtimeMs });
    else job.reject(fromWire(message.error));
    this.dispatch();
  }

  private static reply(slot: ISlot, message: ToWorker) {
    if (!this.slots.includes(slot)) return; // the worker is gone
    try {
      slot.worker.postMessage(message);
    } catch (err) {
      console.error("[BackTestPool] couldn't answer a worker's token request:", asError(err).message);
    }
  }

  /** The worker crashed, exited or ran too long: fail its task, drop it, and start the next task. */
  private static fail(slot: ISlot, err: Error) {
    if (!this.slots.includes(slot)) return; // already handled (terminate also fires "exit")
    this.slots = this.slots.filter((s) => s !== slot);
    clearTimeout(slot.timer);
    const job = slot.current;
    slot.current = null;
    slot.worker.terminate().catch(() => undefined);
    if (job) job.reject(err);
    else console.error("[BackTestPool] an idle worker stopped:", err.message);
    this.dispatch();
  }
}
