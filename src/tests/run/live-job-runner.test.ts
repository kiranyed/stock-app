import { LiveJobRunner } from "../../run/live-job-runner";
import { StrategyScheduler } from "../../run/strategy-scheduler";
import { LiveMasterJob } from "../../shared/classes/live-master-job";
import RunRepository from "../../shared/services/repos/run-repository";
import { ILiveStockScreenerJob } from "../../types/data-processing-types";
import { IndicatorEngine } from "../../engine/engine";
import { IStockGroup } from "../../types/entity-types";
import { HistoricalWarmupService } from "../../run/historical-warmup-service";

jest.mock("../../shared/services/db-api");
jest.mock("../../shared/classes/live-master-job");
jest.mock("../../shared/classes/master-job");
jest.mock("../../run/strategy-scheduler");
jest.mock("../../run/data-retriever");
jest.mock("../../shared/services/repos/run-repository");
jest.mock("../../run/historical-warmup-service");

type FakeMaster = { held: ILiveStockScreenerJob[]; isInitialized: () => boolean; addJobs: jest.Mock; end: jest.Mock };

describe("LiveJobRunner", () => {
  const group: IStockGroup = { id: 1, name: "Test Group", symbols: ["AAPL", "GOOGL"] };
  const job = (runId: number, strategyId: number) => {
    let id = runId;
    return {
      getId: () => id,
      setId: jest.fn((next: number) => (id = next)),
      getConfigId: () => strategyId,
    } as unknown as ILiveStockScreenerJob;
  };
  let masters: FakeMaster[];
  let scheduler: { scheduleStrategies: jest.Mock };
  let warmed: IndicatorEngine;
  let runner: LiveJobRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    masters = [];
    (LiveMasterJob as unknown as jest.Mock).mockImplementation(() => {
      const master: FakeMaster = {
        held: [],
        isInitialized: () => master.held.length > 0,
        addJobs: jest.fn((active: ILiveStockScreenerJob[], _g, _w, paused: ILiveStockScreenerJob[] = []) =>
          master.held.push(...active, ...paused),
        ),
        end: jest.fn(),
      };
      masters.push(master);
      return master;
    });
    scheduler = { scheduleStrategies: jest.fn() };
    (StrategyScheduler as jest.Mock).mockImplementation(() => scheduler);
    warmed = new IndicatorEngine();
    (HistoricalWarmupService.warm as jest.Mock).mockResolvedValue(warmed);
    (RunRepository.createRuns as jest.Mock).mockResolvedValue([{ id: 11, strategy_id: 2 }]);
    (RunRepository.endRuns as jest.Mock).mockResolvedValue(1);
    runner = new LiveJobRunner();
  });

  describe("runJobs", () => {
    it("records the runs, warms up, and starts a scheduled master job", async () => {
      const j = job(0, 2);
      await runner.runJobs([j], group, true);

      expect(RunRepository.createRuns).toHaveBeenCalledWith([2], 1, "simulation", true);
      expect(j.setId).toHaveBeenCalledWith(11);
      expect(HistoricalWarmupService.warm).toHaveBeenCalledWith([j], group);
      const master = masters[masters.length - 1];
      expect(master.addJobs).toHaveBeenCalledWith([j], group, warmed, []);
      expect(scheduler.scheduleStrategies).toHaveBeenCalledWith(master);
    });

    it("ends the new rows when warm-up fails, so they don't stay active with nothing running", async () => {
      (HistoricalWarmupService.warm as jest.Mock).mockRejectedValue(new Error("no candles"));
      await expect(runner.runJobs([job(0, 2)], group)).rejects.toThrow("no candles");
      expect(RunRepository.endRuns).toHaveBeenCalledWith([11]);
    });

    it("passes on a failure to create the rows without ending anything", async () => {
      (RunRepository.createRuns as jest.Mock).mockRejectedValue(new Error("Create failed"));
      await expect(runner.runJobs([job(0, 2)], group)).rejects.toThrow("Create failed");
      expect(RunRepository.endRuns).not.toHaveBeenCalled();
    });

    it("keeps both runs when two starts overlap during warm-up", async () => {
      (RunRepository.createRuns as jest.Mock)
        .mockResolvedValueOnce([{ id: 11, strategy_id: 2 }])
        .mockResolvedValueOnce([{ id: 12, strategy_id: 3 }]);
      const [a, b] = [job(0, 2), job(0, 3)];
      await Promise.all([runner.runJobs([a], group), runner.runJobs([b], group)]);

      const live = masters.filter((m) => m.isInitialized());
      expect(live).toHaveLength(1);
      expect(live[0].held).toEqual([a, b]);
      expect(scheduler.scheduleStrategies).toHaveBeenCalledTimes(1);
    });
  });

  describe("ending a run during its warm-up", () => {
    it("doesn't add it once the warm-up finishes", async () => {
      let finishWarmUp: (engine: IndicatorEngine) => void = () => undefined;
      (HistoricalWarmupService.warm as jest.Mock).mockReturnValue(new Promise((r) => (finishWarmUp = r)));
      const [kept, ended] = [job(21, 2), job(22, 2)];

      const loading = runner.restoreJobs([kept, ended], group, new Set());
      runner.endStrategy(22);
      finishWarmUp(warmed);
      await loading;

      expect(masters[masters.length - 1].held).toEqual([kept]);
    });

    it("forgets the ended id if the warm-up fails, so a later load isn't affected", async () => {
      (HistoricalWarmupService.warm as jest.Mock).mockRejectedValueOnce(new Error("no candles"));
      const loading = runner.restoreJobs([job(22, 2)], group, new Set());
      runner.endStrategy(22);
      await expect(loading).rejects.toThrow("no candles");

      const again = job(22, 2);
      await runner.restoreJobs([again], group, new Set());
      expect(masters[masters.length - 1].held).toEqual([again]);
    });
  });

  describe("restoreJobs", () => {
    it("loads runs that already have ids, holding the paused ones, without creating rows", async () => {
      const [active, paused] = [job(21, 2), job(22, 2)];
      await runner.restoreJobs([active, paused], group, new Set([22]));

      expect(RunRepository.createRuns).not.toHaveBeenCalled();
      expect(masters[masters.length - 1].addJobs).toHaveBeenCalledWith([active], group, warmed, [paused]);
    });
  });
});
