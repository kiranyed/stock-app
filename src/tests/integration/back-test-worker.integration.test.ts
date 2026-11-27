import * as dotenv from "dotenv";
import { BackTestPool, IBackTestWorker, startWorker } from "../../run/back-test-pool";
import { BackTestTask, runBackTestTask } from "../../run/back-test-task";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { PeriodType } from "../../shared/constants";
import { strategy } from "../golden/golden-harness";

// A real worker thread: it loads the app's code, asks this thread for the Schwab token,
// fetches candles itself, and must give exactly what the main thread gives.
describe("Integration - Back tests on a worker thread", () => {
  let started = 0;
  const task = (): BackTestTask => ({
    kind: "strategies",
    strategies: [
      strategy(
        PeriodType.DAY,
        [{ varName: "rsi", timeAgo: "14", operator: "<", compareVal: "40" }],
        [{ varName: "rsi", timeAgo: "14", operator: ">", compareVal: "60" }],
      ),
    ],
    group: { id: 1, name: "worker-test", symbols: ["AAPL", "MSFT"] },
    config: { startTime: Date.UTC(2025, 0, 2), endTime: Date.UTC(2025, 5, 30) },
  });

  beforeAll(async () => {
    dotenv.config();
    await DatabaseAPI.createConnection();
    await SchwabAuth.initialize();
    process.env.BACKTEST_WORKERS = "1";
    BackTestPool.useWorkerFactory((): IBackTestWorker => {
      started++;
      return startWorker();
    });
  }, 60000);

  afterAll(async () => {
    delete process.env.BACKTEST_WORKERS;
    await BackTestPool.close();
    await DatabaseAPI.closeConnection();
  });

  it("gives the same results as running on the main thread", async () => {
    const { results: onWorker, runtimeMs } = await BackTestPool.run(1, task());
    expect(started).toBe(1);
    expect(runtimeMs).toBeGreaterThan(0);
    const onMain = await runBackTestTask(task());
    expect(onWorker).toEqual(onMain);
    // a real back test, not two empty ones: the worker fetched candles and traded
    const [result] = onWorker as unknown as { gains: unknown[] }[];
    expect(result.gains.length).toBeGreaterThan(0);
  }, 120000);

  it("reuses the worker for the next back test", async () => {
    await BackTestPool.run(1, task());
    expect(started).toBe(1);
  }, 120000);
});
