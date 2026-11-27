import { EventEmitter } from "events";
import BaseError from "../../errors/base-error";
import Error404 from "../../errors/error-404";
import { BackTestPool, IBackTestWorker } from "../../run/back-test-pool";
import { BackTestTask, ToWorker, runBackTestTask, toWire } from "../../run/back-test-task";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";

jest.mock("../../run/back-test-task", () => ({
  ...jest.requireActual("../../run/back-test-task"),
  runBackTestTask: jest.fn(),
}));
jest.mock("../../providers/schwab/schwab-auth", () => ({
  SchwabAuth: { getAccessToken: jest.fn(), forceRefresh: jest.fn() },
}));

class FakeWorker extends EventEmitter {
  posted: ToWorker[] = [];
  refd = false;
  postMessage = jest.fn((message: ToWorker) => {
    this.posted.push(message);
  });
  terminate = jest.fn(async () => {
    this.emit("exit", 1);
    return 1;
  });
  ref = jest.fn(() => (this.refd = true));
  unref = jest.fn(() => (this.refd = false));
  /** The worker finishes its task. */
  done(results: unknown, runtimeMs = 5) {
    this.emit("message", { type: "done", results, runtimeMs });
  }
}

let workers: FakeWorker[];
let startWorker: jest.Mock;
const task = (name: string): BackTestTask =>
  ({ kind: "strategies", strategies: [{ name }], group: { id: 1 }, config: {} }) as unknown as BackTestTask;
const ran = (results: unknown, runtimeMs = 5) => ({ results, runtimeMs });
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** Starts a back test the test doesn't wait for; cleanup's close() rejects it, which is fine. */
const background = (promise: Promise<unknown>) => void promise.catch(() => undefined);
const env = (vars: Record<string, string>) => Object.assign(process.env, vars);
const NAMES = [
  "DEPLOYMENT",
  "BACKTEST_WORKERS",
  "BACKTEST_MAX_PER_USER",
  "BACKTEST_TIMEOUT_MS",
  "BACKTEST_MAX_WAITING",
  "BACKTEST_MAX_WAIT_MS",
];

beforeEach(async () => {
  await BackTestPool.close();
  jest.clearAllMocks();
  for (const name of NAMES) delete process.env[name];
  env({
    BACKTEST_WORKERS: "2",
    BACKTEST_MAX_PER_USER: "0",
    BACKTEST_TIMEOUT_MS: "0",
    BACKTEST_MAX_WAITING: "0",
    BACKTEST_MAX_WAIT_MS: "0",
  });
  workers = [];
  startWorker = jest.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as IBackTestWorker;
  });
  BackTestPool.useWorkerFactory(startWorker);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(async () => {
  await BackTestPool.close();
  for (const name of NAMES) delete process.env[name];
});

describe("BackTestPool", () => {
  describe("running and queueing", () => {
    it("runs a task on a worker and returns its results and the worker's run time", async () => {
      const run = BackTestPool.run(1, task("a"));
      expect(workers).toHaveLength(1);
      expect(workers[0].posted).toEqual([{ type: "run", task: task("a") }]);
      expect(workers[0].refd).toBe(true); // keeps the process alive while it works

      workers[0].done([{ total: 1 }], 321);
      await expect(run).resolves.toEqual(ran([{ total: 1 }], 321));
      expect(workers[0].refd).toBe(false);
    });

    it("starts at most BACKTEST_WORKERS workers; later tasks wait in line, in order", async () => {
      const runs = ["a", "b", "c", "d"].map((name, i) => BackTestPool.run(i, task(name)));
      runs.forEach(background); // c and d are still running when the test ends
      expect(workers).toHaveLength(2);
      expect(workers.map((w) => w.posted.length)).toEqual([1, 1]);

      workers[1].done("b");
      await expect(runs[1]).resolves.toEqual(ran("b"));
      expect(workers[1].posted[1]).toEqual({ type: "run", task: task("c") });
      workers[0].done("a");
      await expect(runs[0]).resolves.toEqual(ran("a"));
      expect(workers[0].posted[1]).toEqual({ type: "run", task: task("d") });
      expect(workers).toHaveLength(2); // reused, not restarted
    });

    it("start() loads the workers ahead of the first task, and twice is the same as once", () => {
      BackTestPool.start();
      BackTestPool.start();
      expect(workers).toHaveLength(2);
      background(BackTestPool.run(1, task("a")));
      expect(workers).toHaveLength(2);
      expect(workers[0].posted).toHaveLength(1);
    });

    it("keeps working on the settings it read when a bad value appears later", async () => {
      env({ BACKTEST_WORKERS: "1", BACKTEST_TIMEOUT_MS: "60000" });
      const first = BackTestPool.run(1, task("a"));
      const second = BackTestPool.run(2, task("b"));
      const third = BackTestPool.run(3, task("c"));
      env({ BACKTEST_WORKERS: "lots", BACKTEST_TIMEOUT_MS: "forever" });
      // finishing a hands b to the worker, and c finds no free worker; neither may read the
      // bad values from inside this worker event, where a throw would crash the server
      expect(() => workers[0].done("a")).not.toThrow();
      await expect(first).resolves.toEqual(ran("a"));
      expect(workers[0].posted[1]).toEqual({ type: "run", task: task("b") });
      workers[0].done("b");
      await expect(second).resolves.toEqual(ran("b"));
      workers[0].done("c");
      await expect(third).resolves.toEqual(ran("c"));

      // the next caller gets the error, and nothing is left counted or queued
      await expect(BackTestPool.run(1, task("d"))).rejects.toThrow("BACKTEST_WORKERS must be a whole number");
    });
  });

  describe("per-user limit", () => {
    it("refuses with 429 past BACKTEST_MAX_PER_USER, counting waiting tasks, per user", async () => {
      env({ BACKTEST_WORKERS: "1", BACKTEST_MAX_PER_USER: "2" });
      const first = BackTestPool.run(1, task("a"));
      background(BackTestPool.run(1, task("b"))); // waiting in line still counts
      await expect(BackTestPool.run(1, task("c"))).rejects.toMatchObject({
        statusCode: 429,
        message: "You already have 2 back tests running. Try again when one finishes.",
      });
      background(BackTestPool.run(2, task("other user")));

      workers[0].done("a");
      await first;
      background(BackTestPool.run(1, task("d"))); // a slot freed up
    });

    it("frees the user's slot when a back test fails, crashes or times out", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_WORKERS: "1", BACKTEST_MAX_PER_USER: "1", BACKTEST_TIMEOUT_MS: "1000" });
        const failed = BackTestPool.run(1, task("a"));
        workers[0].emit("message", { type: "failed", error: toWire(new Error("bad")) });
        await expect(failed).rejects.toThrow("bad");

        const crashed = BackTestPool.run(1, task("b"));
        workers[0].emit("error", new Error("crash"));
        await expect(crashed).rejects.toThrow("crash");

        const slow = BackTestPool.run(1, task("c"));
        jest.advanceTimersByTime(1000);
        await expect(slow).rejects.toMatchObject({ statusCode: 503 });

        const next = BackTestPool.run(1, task("d"));
        workers[workers.length - 1].done("d");
        await expect(next).resolves.toEqual(ran("d"));
      } finally {
        jest.useRealTimers();
      }
    });

    it("has no per-user limit at 0, the self-hosted default", () => {
      delete process.env.BACKTEST_MAX_PER_USER;
      for (let i = 0; i < 5; i++) background(BackTestPool.run(1, task(String(i))));
      expect(workers).toHaveLength(2);
    });
  });

  describe("failures", () => {
    it("passes a worker's error on with its status, and the worker is free again", async () => {
      const run = BackTestPool.run(1, task("a"));
      workers[0].emit("message", { type: "failed", error: toWire(new Error404("strategy not found")) });
      const err = await run.catch((e) => e);
      expect(err).toBeInstanceOf(BaseError);
      expect(err).toMatchObject({ statusCode: 404, message: "strategy not found" });

      background(BackTestPool.run(1, task("b")));
      expect(workers).toHaveLength(1);
      expect(workers[0].posted).toHaveLength(2);
    });

    it("fails the task of a worker that crashes, and starts a new worker for the next", async () => {
      env({ BACKTEST_WORKERS: "1" });
      const first = BackTestPool.run(1, task("a"));
      const second = BackTestPool.run(2, task("b"));
      workers[0].emit("error", new Error("out of memory"));

      await expect(first).rejects.toThrow("out of memory");
      expect(workers[0].terminate).toHaveBeenCalled();
      expect(workers).toHaveLength(2);
      expect(workers[1].posted).toEqual([{ type: "run", task: task("b") }]);
      workers[1].done("b");
      await expect(second).resolves.toEqual(ran("b"));
    });

    it("fails a task whose worker exits", async () => {
      const run = BackTestPool.run(1, task("a"));
      workers[0].emit("exit", 1);
      await expect(run).rejects.toThrow("back test worker stopped (exit code 1)");
    });

    it("drops an idle worker that stops, and starts a new one for the next task", async () => {
      BackTestPool.start();
      workers[0].emit("exit", 1);
      expect(console.error).toHaveBeenCalledWith("[BackTestPool] an idle worker stopped:", expect.any(String));
      background(BackTestPool.run(1, task("a")));
      background(BackTestPool.run(2, task("b")));
      expect(workers[0].posted).toHaveLength(0);
      expect(workers.slice(1).map((w) => w.posted.length)).toEqual([1, 1]);
    });

    it("fails each waiting task once when workers can't start, without looping", async () => {
      env({ BACKTEST_WORKERS: "1" });
      startWorker.mockImplementation(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        // like a worker whose code can't load: it errors as soon as it starts
        setImmediate(() => worker.emit("error", new Error("Cannot find module 'ts-node/register'")));
        return worker as unknown as IBackTestWorker;
      });
      const runs = ["a", "b", "c"].map((name, i) => BackTestPool.run(i, task(name)));
      for (const run of runs) await expect(run).rejects.toThrow("Cannot find module");
      expect(startWorker).toHaveBeenCalledTimes(3); // one per task, then it stops
      await flush();
      expect(startWorker).toHaveBeenCalledTimes(3);
    });

    it("fails only that task when starting a worker throws, and the next can still run", async () => {
      startWorker.mockImplementationOnce(() => {
        throw new Error("ERR_WORKER_INIT_FAILED");
      });
      await expect(BackTestPool.run(1, task("a"))).rejects.toThrow("ERR_WORKER_INIT_FAILED");
      const next = BackTestPool.run(1, task("b"));
      workers[0].done("b");
      await expect(next).resolves.toEqual(ran("b"));
    });

    it("fails only that task when it can't be sent to the worker, and keeps the worker", async () => {
      env({ BACKTEST_WORKERS: "1" });
      BackTestPool.start();
      workers[0].postMessage.mockImplementationOnce(() => {
        throw new Error("DataCloneError: function could not be cloned");
      });
      await expect(BackTestPool.run(1, task("a"))).rejects.toThrow("DataCloneError");
      expect(workers[0].refd).toBe(false);

      const next = BackTestPool.run(1, task("b"));
      expect(workers).toHaveLength(1);
      workers[0].done("b");
      await expect(next).resolves.toEqual(ran("b"));
    });
  });

  describe("waiting for a worker", () => {
    it("refuses with 503 past BACKTEST_MAX_WAITING tasks waiting, across users, until the line moves", async () => {
      env({ BACKTEST_WORKERS: "1", BACKTEST_MAX_WAITING: "2", BACKTEST_MAX_PER_USER: "2" });
      const running = BackTestPool.run(1, task("a"));
      const waiting = [BackTestPool.run(2, task("b")), BackTestPool.run(3, task("c"))];
      waiting.forEach(background);

      await expect(BackTestPool.run(1, task("d"))).rejects.toMatchObject({
        statusCode: 503,
        message: "The server already has 2 back tests waiting. Try again in a minute.",
      });
      expect(workers[0].posted).toHaveLength(1);

      // a finishes and b starts, which makes room for one more; the refused d isn't counted
      // against user 1, who may have a second back test waiting next to e
      workers[0].done("a");
      await expect(running).resolves.toEqual(ran("a"));
      expect(workers[0].posted[1]).toEqual({ type: "run", task: task("b") });
      const e = BackTestPool.run(1, task("e"));
      background(e);
      await expect(Promise.race([e, flush().then(() => "waiting")])).resolves.toBe("waiting");
      await expect(BackTestPool.run(4, task("f"))).rejects.toMatchObject({ statusCode: 503 });
    });

    it("doesn't count a task a free worker takes at once", async () => {
      env({ BACKTEST_WORKERS: "2", BACKTEST_MAX_WAITING: "1" });
      background(BackTestPool.run(1, task("a")));
      background(BackTestPool.run(2, task("b")));
      background(BackTestPool.run(3, task("c")));
      expect(workers.map((w) => w.posted.length)).toEqual([1, 1]);
      await expect(BackTestPool.run(4, task("d"))).rejects.toMatchObject({ statusCode: 503 });
    });

    it("drops a task still waiting after BACKTEST_MAX_WAIT_MS with a 503, and frees the user's slot", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_WORKERS: "1", BACKTEST_MAX_WAIT_MS: "60000", BACKTEST_MAX_PER_USER: "1" });
        const running = BackTestPool.run(1, task("a"));
        const waiting = BackTestPool.run(2, task("b"));
        jest.advanceTimersByTime(59999);
        workers[0].done("a");
        await expect(running).resolves.toEqual(ran("a"));
        // b got the worker in time, so its deadline is gone
        expect(workers[0].posted[1]).toEqual({ type: "run", task: task("b") });
        const late = BackTestPool.run(3, task("c"));
        jest.advanceTimersByTime(60000);
        await expect(late).rejects.toMatchObject({
          statusCode: 503,
          message: "The back test waited more than 1 minute for a free worker and was dropped. Try again later.",
        });
        workers[0].done("b");
        await expect(waiting).resolves.toEqual(ran("b"));
        expect(workers[0].posted).toHaveLength(2); // c was never sent

        // user 3 may start another back test
        const again = BackTestPool.run(3, task("d"));
        expect(workers[0].posted[2]).toEqual({ type: "run", task: task("d") });
        workers[0].done("d");
        await expect(again).resolves.toEqual(ran("d"));
      } finally {
        jest.useRealTimers();
      }
    });

    it("has defaults for both limits in each profile, and 0 turns them off", async () => {
      for (const name of ["BACKTEST_MAX_WAITING", "BACKTEST_MAX_WAIT_MS", "BACKTEST_WORKERS"]) delete process.env[name];
      env({ BACKTEST_WORKERS: "1" });
      background(BackTestPool.run(1, task("a")));
      const waiting = Array.from({ length: 20 }, (_, i) => BackTestPool.run(i + 2, task(`w${i}`)));
      waiting.forEach(background);
      await expect(BackTestPool.run(99, task("x"))).rejects.toMatchObject({ statusCode: 503 }); // self-hosted: 20

      await BackTestPool.close();
      env({ BACKTEST_MAX_WAITING: "0", BACKTEST_MAX_WAIT_MS: "0" });
      background(BackTestPool.run(1, task("a")));
      const many = Array.from({ length: 100 }, (_, i) => BackTestPool.run(i + 2, task(`m${i}`)));
      many.forEach(background);
      await flush();
      await expect(Promise.race([...many, flush().then(() => "still waiting")])).resolves.toBe("still waiting");
    });

    it("close() clears the waiting tasks' deadlines", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_WORKERS: "1", BACKTEST_MAX_WAIT_MS: "1000" });
        background(BackTestPool.run(1, task("a")));
        const waiting = BackTestPool.run(2, task("b"));
        await BackTestPool.close();
        await expect(waiting).rejects.toThrow("shutting down");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("timeout", () => {
    it("stops a back test that runs past BACKTEST_TIMEOUT_MS", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_TIMEOUT_MS: "90000" });
        const run = BackTestPool.run(1, task("a"));
        jest.advanceTimersByTime(90000);
        await expect(run).rejects.toMatchObject({
          statusCode: 503,
          message: expect.stringContaining("ran longer than 1.5 minutes"),
        });
        expect(workers[0].terminate).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("ignores a late answer from a worker that was stopped", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_WORKERS: "1", BACKTEST_TIMEOUT_MS: "1000" });
        const run = BackTestPool.run(1, task("a"));
        jest.advanceTimersByTime(1000);
        await expect(run).rejects.toMatchObject({ statusCode: 503 });

        const next = BackTestPool.run(2, task("b"));
        workers[0].done("a, too late"); // must not settle b
        workers[1].done("b");
        await expect(next).resolves.toEqual(ran("b"));
      } finally {
        jest.useRealTimers();
      }
    });

    it("doesn't time out a back test that finished", async () => {
      jest.useFakeTimers();
      try {
        env({ BACKTEST_TIMEOUT_MS: "1000" });
        const run = BackTestPool.run(1, task("a"));
        workers[0].done("a");
        await expect(run).resolves.toEqual(ran("a"));
        jest.advanceTimersByTime(5000);
        expect(workers[0].terminate).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("Schwab tokens", () => {
    it("answers a worker's token requests from the main thread's sign-in", async () => {
      (SchwabAuth.getAccessToken as jest.Mock).mockResolvedValue("cached");
      (SchwabAuth.forceRefresh as jest.Mock).mockResolvedValue("fresh");
      background(BackTestPool.run(1, task("a")));
      workers[0].emit("message", { type: "token", id: 1, force: false });
      workers[0].emit("message", { type: "token", id: 2, force: true });
      await flush();
      expect(workers[0].posted.slice(1)).toEqual([
        { type: "token", id: 1, token: "cached" },
        { type: "token", id: 2, token: "fresh" },
      ]);

      (SchwabAuth.getAccessToken as jest.Mock).mockRejectedValue(new BaseError("Schwab sign-in needed", 503, true));
      workers[0].emit("message", { type: "token", id: 3, force: false });
      await flush();
      expect(workers[0].posted[3]).toMatchObject({
        type: "token",
        id: 3,
        error: { message: "Schwab sign-in needed", statusCode: 503 },
      });
    });

    it("drops a token answer for a worker that has since stopped", async () => {
      let answer: (token: string) => void = () => undefined;
      (SchwabAuth.getAccessToken as jest.Mock).mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const run = BackTestPool.run(1, task("a"));
      workers[0].emit("message", { type: "token", id: 1, force: false });
      workers[0].emit("error", new Error("crash"));
      await expect(run).rejects.toThrow("crash");
      answer("late");
      await flush();
      expect(workers[0].posted).toHaveLength(1); // only the task
    });
  });

  it("runs on the main thread when BACKTEST_WORKERS is 0, with the same per-user limit", async () => {
    env({ BACKTEST_WORKERS: "0", BACKTEST_MAX_PER_USER: "1" });
    let finish: (value: unknown) => void = () => undefined;
    (runBackTestTask as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const run = BackTestPool.run(1, task("a"));
    expect(runBackTestTask).toHaveBeenCalledWith(task("a"));
    expect(workers).toHaveLength(0);
    await expect(BackTestPool.run(1, task("b"))).rejects.toMatchObject({ statusCode: 429 });
    finish(["main"]);
    await expect(run).resolves.toEqual({ results: ["main"], runtimeMs: expect.any(Number) });
  });

  it("close() fails running and waiting tasks and stops the workers", async () => {
    env({ BACKTEST_WORKERS: "1" });
    const running = BackTestPool.run(1, task("a"));
    const waiting = BackTestPool.run(2, task("b"));
    await BackTestPool.close();
    await expect(running).rejects.toThrow("shutting down");
    await expect(waiting).rejects.toThrow("shutting down");
    expect(workers[0].terminate).toHaveBeenCalled();
  });
});
