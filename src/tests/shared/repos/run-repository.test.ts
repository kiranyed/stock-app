import { DatabaseAPI } from "../../../shared/services/db-api";
import RunRepository from "../../../shared/services/repos/run-repository";
import PaperPositionRepository from "../../../shared/services/repos/paper-position-repository";

jest.mock("../../../shared/services/db-api");
jest.mock("../../../shared/services/repos/paper-position-repository");

const query = DatabaseAPI.query as jest.Mock;
const insert = DatabaseAPI.insert as jest.Mock;
const modify = DatabaseAPI.modify as jest.Mock;
const NOW = 1609459200000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("RunRepository", () => {
  it("finds a run only through its strategy's owner", async () => {
    query.mockResolvedValueOnce([{ id: 5 }]).mockResolvedValueOnce([]);
    await expect(RunRepository.getOwnedRun(5, 7)).resolves.toEqual({ id: 5 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/join strategy on strategy.id = live_job.strategy_id/);
    expect(sql).toMatch(/live_job.id = \? and strategy.user_id = \?/);
    expect(params).toEqual([5, 7]);
    await expect(RunRepository.getOwnedRun(6, 7)).resolves.toBeUndefined();
  });

  it("lists owned runs by id, skipping the database for none", async () => {
    query.mockResolvedValueOnce([]);
    await RunRepository.getOwnedRuns([1, 2], 7);
    expect(query.mock.calls[0][1]).toEqual([[1, 2], 7]);
    await expect(RunRepository.getOwnedRuns([], 7)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("lists the user's current runs of one type", async () => {
    query.mockResolvedValueOnce([]);
    await RunRepository.getCurrentRuns(7, "real");
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/strategy.user_id = \? and live_job.job_type = \?/);
    expect(params).toEqual([7, "real"]);
  });

  it("creates one row per strategy and reads back exactly those rows", async () => {
    insert.mockResolvedValueOnce(40).mockResolvedValueOnce(41);
    query.mockResolvedValueOnce([{ id: 40 }, { id: 41 }]);
    await expect(RunRepository.createRuns([1, 2], 3, "simulation", true)).resolves.toEqual([{ id: 40 }, { id: 41 }]);
    expect(insert.mock.calls.map((c) => c[1])).toEqual([
      [1, 3, NOW, "simulation", true],
      [2, 3, NOW, "simulation", true],
    ]);
    expect(insert.mock.calls[0][0]).not.toMatch(/LAST_INSERT_ID|;/);
    expect(query.mock.calls[0]).toEqual(["select * from live_job where id in (?) order by id", [[40, 41]]]);
  });

  it("lists every user's unfinished runs started before a time, with their strategy's owner", async () => {
    query.mockResolvedValueOnce([]);
    await RunRepository.getUnfinishedRuns(123);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/strategy.user_id as owner_id/);
    expect(sql).toMatch(/left join strategy/);
    expect(sql).toMatch(/live_job.status in \('active', 'paused'\) and live_job.start_time < \?/);
    expect(params).toEqual([123]);
  });

  it("ends only runs that are still active or paused and forgets their positions, skipping the database for none", async () => {
    modify.mockResolvedValue(2);
    await expect(RunRepository.endRuns([4, 5])).resolves.toBe(2);
    const [sql, params] = modify.mock.calls[0];
    expect(sql).toMatch(/status = 'ended'.*where id in \(\?\) and status in \('active', 'paused'\)/);
    expect(params).toEqual([NOW, [4, 5]]);
    expect(PaperPositionRepository.deleteForRuns).toHaveBeenCalledWith([4, 5]);
    await expect(RunRepository.endRuns([])).resolves.toBe(0);
    expect(modify).toHaveBeenCalledTimes(1);
    expect(PaperPositionRepository.deleteForRuns).toHaveBeenCalledTimes(1);
  });

  it("changes status only from the allowed states, stamping the end time on end", async () => {
    modify.mockResolvedValue(1);
    await RunRepository.setStatus(5, ["active"], "paused");
    expect(modify.mock.calls[0][1]).toEqual(["paused", null, 5, ["active"]]);
    await RunRepository.setStatus(5, ["active", "paused"], "ended");
    expect(modify.mock.calls[1][1]).toEqual(["ended", NOW, 5, ["active", "paused"]]);
    // positions are forgotten by the caller once the run has stopped (RunService.transition)
    expect(PaperPositionRepository.deleteForRuns).not.toHaveBeenCalled();
  });

  it("ending runs still succeeds when their positions can't be deleted; the failure is logged", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    modify.mockResolvedValue(2);
    (PaperPositionRepository.deleteForRuns as jest.Mock).mockRejectedValueOnce(new Error("lock wait timeout"));
    await expect(RunRepository.endRuns([4, 5])).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ended runs 4, 5"), expect.any(Error));
    error.mockRestore();
  });
});
