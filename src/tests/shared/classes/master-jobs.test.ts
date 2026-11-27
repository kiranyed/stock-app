import { LiveMasterJob } from "../../../shared/classes/live-master-job";
import { BackTestMasterJob } from "../../../shared/classes/back-test-master-job";
import { TradeLogger } from "../../../shared/utilities/trade-logger";
import { DataRetriever } from "../../../run/data-retriever";
import { PeriodType } from "../../../shared/constants";
import { IStockData } from "../../../types/data-processing-types";
import { ProbeBackTest, etTime, strategy } from "../../golden/golden-harness";

jest.mock("../../../shared/utilities/trade-logger");
jest.mock("../../../run/data-retriever");

const always = [{ varName: "price", operator: ">", compareVal: "0" }];
const probe = (period: PeriodType, id = 1) => {
  const job = new ProbeBackTest(strategy(period, always, undefined, id));
  job.setId(id);
  return job;
};
const quote = (t: number, symbol = "AAA"): IStockData => ({ symbol, price: 10, datetime: t, volume: 100 });

describe("LiveMasterJob", () => {
  afterEach(() => jest.restoreAllMocks());

  it("pause, resume, end and endAll move jobs between lists", () => {
    const a = probe(PeriodType.MINUTE, 1);
    const b = probe(PeriodType.MINUTE, 2);
    const master = new LiveMasterJob([a, b], { id: 1, name: "", symbols: ["AAA"] });

    master.pause(1);
    expect(master.jobs).toEqual([b]);
    expect(master.pausedJobs).toEqual([a]);
    master.resume(1);
    expect(master.jobs).toEqual([b, a]);
    master.end(2);
    expect(master.jobs).toEqual([a]);
    master.endAll();
    expect(TradeLogger.renameStrategyLog).toHaveBeenCalledWith("Run1");
    expect(master.jobs).toEqual([]);
    expect(master.pausedJobs).toEqual([]);
  });

  it("counts as initialized while it holds only paused jobs", () => {
    const a = probe(PeriodType.MINUTE, 1);
    const master = new LiveMasterJob([a], { id: 1, name: "", symbols: ["AAA"] });
    master.pause(1);
    expect(master.isInitialized()).toBe(true);
    master.end(1);
    expect(master.isInitialized()).toBe(false);
  });

  it("addJobs can add jobs paused, and they run once resumed", () => {
    const a = probe(PeriodType.MINUTE, 1);
    const master = new LiveMasterJob([], { id: 1, name: "", symbols: ["AAA"] });
    master.addJobs([], { id: 1, name: "", symbols: ["AAA"] }, undefined, [a]);
    expect(master.jobs).toEqual([]);
    expect(master.pausedJobs).toEqual([a]);

    const first = [quote(etTime("2025-06-23", "10:00"))];
    master.handleNewData(first);
    master.finishJob(first);
    expect(a.history).toEqual([]);

    master.resume(1);
    const next = [quote(etTime("2025-06-23", "10:01"))];
    master.handleNewData(next);
    master.finishJob(next);
    expect(a.history.length).toBe(1);
  });

  it("a paused job doesn't run", () => {
    const a = probe(PeriodType.MINUTE, 1);
    const master = new LiveMasterJob([a], { id: 1, name: "", symbols: ["AAA"] });
    master.pause(1);
    const data = [quote(etTime("2025-06-23", "10:00"))];
    master.handleNewData(data);
    master.finishJob(data);
    expect(a.history).toEqual([]);
  });

  it("run() fetches the DAY period's symbols at 15:59 and runs the DAY job", async () => {
    jest.spyOn(Date, "now").mockReturnValue(etTime("2025-06-23", "15:59"));
    const day = probe(PeriodType.DAY);
    const master = new LiveMasterJob([day], { id: 1, name: "", symbols: ["AAA"] });
    (DataRetriever.getData as jest.Mock).mockResolvedValue([quote(etTime("2025-06-23", "15:59"))]);

    await master.run();

    expect(DataRetriever.getData).toHaveBeenCalledWith([PeriodType.DAY], { [PeriodType.DAY]: ["AAA"] });
    expect(day.history).toHaveLength(1);
  });

  it("run(time) stamps the quotes with the tick's minute, however late they arrive", async () => {
    const t = etTime("2025-06-23", "10:00");
    const job = probe(PeriodType.MINUTE);
    const master = new LiveMasterJob([job], { id: 1, name: "", symbols: ["AAA"] });
    (DataRetriever.getData as jest.Mock).mockResolvedValue([quote(t + 61_000)]);

    await master.run(t);

    expect(job.fed).toEqual([{ t, symbol: "AAA", price: 10 }]);
  });

  it("one run's error, thrown or rejected, doesn't stop the others", async () => {
    const throws = probe(PeriodType.MINUTE, 1);
    const rejects = probe(PeriodType.MINUTE, 2);
    const fine = probe(PeriodType.MINUTE, 3);
    jest.spyOn(throws, "run").mockImplementation(() => {
      throw new Error("boom");
    });
    jest.spyOn(rejects, "run").mockImplementation((() => Promise.reject(new Error("later"))) as never);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const master = new LiveMasterJob([throws, rejects, fine], { id: 1, name: "", symbols: ["AAA"] });

    const data = [quote(etTime("2025-06-23", "10:00"))];
    master.handleNewData(data);
    master.finishJob(data);
    await Promise.resolve();

    expect(fine.history).toHaveLength(1);
    expect(error.mock.calls.map(([m]) => m)).toEqual([
      expect.stringContaining("run 1 failed"),
      expect.stringContaining("run 2 failed"),
    ]);
  });

  it("run() throws when a period is due and no quotes come back", async () => {
    const t = etTime("2025-06-23", "10:00");
    const master = new LiveMasterJob([probe(PeriodType.MINUTE)], { id: 1, name: "", symbols: ["AAA"] });
    (DataRetriever.getData as jest.Mock).mockResolvedValue([]);
    await expect(master.run(t)).rejects.toThrow("no quotes");
  });

  it("a real-money style run still going from the last minute skips this one", async () => {
    const job = probe(PeriodType.MINUTE, 7);
    let finish: () => void = () => undefined;
    const run = jest
      .spyOn(job, "run")
      .mockImplementation((() => new Promise<void>((r) => (finish = r))) as never);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const master = new LiveMasterJob([job], { id: 1, name: "", symbols: ["AAA"] });
    const minute = (hhmm: string) => {
      const data = [quote(etTime("2025-06-23", hhmm))];
      master.handleNewData(data);
      master.finishJob(data);
    };

    minute("10:00");
    minute("10:01");
    expect(run).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("run 7 skipped"));

    finish();
    await new Promise((r) => setImmediate(r));
    minute("10:02");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("run() fetches nothing when no period closes", async () => {
    jest.spyOn(Date, "now").mockReturnValue(etTime("2025-06-23", "10:01"));
    (DataRetriever.getData as jest.Mock).mockClear();
    const master = new LiveMasterJob([probe(PeriodType.FIVE_MINUTES)], { id: 1, name: "", symbols: ["AAA"] });
    await master.run();
    expect(DataRetriever.getData).not.toHaveBeenCalled();
  });
});

describe("MasterJob timing across DST", () => {
  it.each([
    ["before DST", Date.UTC(2024, 2, 8, 14, 30)],
    ["after DST", Date.UTC(2024, 2, 11, 13, 30)],
  ])("9:30 ET %s runs intraday jobs", (_n, t) => {
    const job = probe(PeriodType.FIVE_MINUTES);
    const master = new LiveMasterJob([job], { id: 1, name: "", symbols: ["AAA"] });
    master.finishJob([quote(t)]);
    expect(job.fed).toEqual([{ t, symbol: "AAA", price: 10 }]);
  });
});

describe("BackTestMasterJob", () => {
  it("returns each job's results in order", () => {
    const a = probe(PeriodType.DAY, 1);
    const b = probe(PeriodType.DAY, 2);
    const master = new BackTestMasterJob([a, b], { id: 1, name: "", symbols: ["AAA"] }, { startTime: 0, endTime: 0 });
    const results = master.getAllTestResults() as { name: string }[];
    expect(results.map((r) => r.name)).toEqual(["golden-1", "golden-2"]);
  });
});
