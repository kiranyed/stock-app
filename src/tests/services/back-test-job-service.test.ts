import Error404 from "../../errors/error-404";
import Error429 from "../../errors/error-429";
import {
  BackTestJobService,
  KEEP_FINISHED_MS,
  KEEP_FINISHED_PER_USER,
} from "../../services/back-test-job-service";
import { RunService } from "../../services/run-service";

jest.mock("../../run/live-job-runner");
jest.mock("../../run/back-test-pool");
jest.mock("../../shared/services/screener-job-service");
jest.mock("../../shared/services/repos/run-repository");
jest.mock("../../shared/services/repos/backtest-result-repository");

const request = { strategyIds: [4, 6], groupId: 3, startTime: 100, endTime: 200 };
const strategies = [
  { id: 4, name: "Dip" },
  { id: 6, name: "Breakout" },
];
const gains = [{ total: 0.05, tradeNum: 2, gains: [{ gainPercent: 10 }, { gainPercent: -4 }], name: "Dip" }, []];

/** A back test whose `run` stays pending until the test settles it. */
const deferredRun = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const prepare = jest.spyOn(RunService, "prepareBackTest").mockResolvedValue({
    strategies,
    run: () => promise as never,
  });
  return { resolve, reject, prepare };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.restoreAllMocks();
  BackTestJobService.reset();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("BackTestJobService", () => {
  it("returns a job id while the back test runs, then its summaries", async () => {
    const run = deferredRun();
    const { jobId, status } = await BackTestJobService.start(7, request);
    expect(status).toBe("running");
    expect(run.prepare).toHaveBeenCalledWith(7, request);
    expect(BackTestJobService.get(7, jobId)).toMatchObject({ jobId, status: "running", request });

    run.resolve(gains);
    await flush();
    const done = BackTestJobService.get(7, jobId);
    expect(done).toMatchObject({ status: "done", finishedAt: expect.any(Number) });
    expect(done.results).toEqual([
      { strategyId: 4, strategyName: "Dip", trades: 2, wins: 1, winRate: 50, returnPct: 5, maxDrawdown: expect.closeTo(4, 6) },
      { strategyId: 6, strategyName: "Breakout", trades: 0, wins: 0, winRate: 0, returnPct: 0, maxDrawdown: 0 },
    ]);
    expect(done.results![0]).not.toHaveProperty("tradeList");
    expect(BackTestJobService.get(7, jobId, true).results![0]).toHaveProperty("tradeList", (gains[0] as { gains: unknown }).gains);
  });

  it("rejects a bad request at once, without a job", async () => {
    jest.spyOn(RunService, "prepareBackTest").mockRejectedValue(new Error404("stock group not found"));
    await expect(BackTestJobService.start(7, request)).rejects.toThrow("stock group not found");
    expect(BackTestJobService.list(7)).toEqual([]);
  });

  it("reports our own errors as written", async () => {
    const run = deferredRun();
    const { jobId } = await BackTestJobService.start(7, request);
    run.reject(new Error429("You already have 2 back tests running. Try again when one finishes."));
    await flush();
    expect(BackTestJobService.get(7, jobId)).toMatchObject({
      status: "failed",
      error: "You already have 2 back tests running. Try again when one finishes.",
    });
  });

  it("hides unexpected errors", async () => {
    const run = deferredRun();
    const { jobId } = await BackTestJobService.start(7, request);
    run.reject(new Error("ECONNRESET 10.0.0.5:3306"));
    await flush();
    expect(BackTestJobService.get(7, jobId)).toMatchObject({ status: "failed", error: "Internal server error" });
    expect(console.error).toHaveBeenCalled();
  });

  it("shows a job only to the user who started it", async () => {
    deferredRun();
    const { jobId } = await BackTestJobService.start(7, request);
    expect(() => BackTestJobService.get(8, jobId)).toThrow(Error404);
    expect(() => BackTestJobService.get(7, "no-such-job")).toThrow(Error404);
    expect(BackTestJobService.list(8)).toEqual([]);
    expect(BackTestJobService.list(7)).toEqual([expect.objectContaining({ jobId, status: "running" })]);
  });

  it("forgets finished jobs after an hour, but never running ones", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const first = deferredRun();
    const { jobId: finished } = await BackTestJobService.start(7, request);
    first.resolve(gains);
    await flush();
    deferredRun();
    const { jobId: running } = await BackTestJobService.start(7, request);

    now.mockReturnValue(1_000 + KEEP_FINISHED_MS + 1);
    expect(() => BackTestJobService.get(7, finished)).toThrow(Error404);
    expect(BackTestJobService.get(7, running).status).toBe("running");
  });

  it(`keeps the newest ${KEEP_FINISHED_PER_USER} finished jobs per user`, async () => {
    const now = jest.spyOn(Date, "now");
    const ids: string[] = [];
    for (let i = 0; i <= KEEP_FINISHED_PER_USER; i++) {
      now.mockReturnValue(10_000 + i);
      const run = deferredRun();
      ids.push((await BackTestJobService.start(7, request)).jobId);
      run.resolve(gains);
      await flush();
    }
    expect(() => BackTestJobService.get(7, ids[0])).toThrow(Error404);
    expect(BackTestJobService.get(7, ids[1]).status).toBe("done");
    expect(BackTestJobService.list(7)).toHaveLength(KEEP_FINISHED_PER_USER);
  });
});
