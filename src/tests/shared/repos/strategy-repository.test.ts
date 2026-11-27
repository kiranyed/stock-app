import { DatabaseAPI } from "../../../shared/services/db-api";
import StrategyRepository from "../../../shared/services/repos/strategy-repository";

jest.mock("../../../shared/services/db-api");

const query = DatabaseAPI.query as jest.Mock;
const insert = DatabaseAPI.insert as jest.Mock;
const modify = DatabaseAPI.modify as jest.Mock;
const EVIL = "x'; drop table strategy; --";
const fields = { name: EVIL, description: EVIL, period: 30, screeners: [] };

const lastCall = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1];
const expectNoValuesInSql = (sql: string) => {
  expect(sql).not.toContain(EVIL);
  expect(sql).not.toMatch(/'/);
};

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([]);
  insert.mockResolvedValue(11);
  modify.mockResolvedValue(1);
});

describe("StrategyRepository", () => {
  it("creates one or many strategies in one statement", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    await expect(StrategyRepository.createStrategy([fields, { ...fields, name: "b" }], 7)).resolves.toEqual({ insertId: 11 });
    const [sql, params] = lastCall(insert);
    expectNoValuesInSql(sql);
    expect(sql).toMatch(/values \?$/);
    // the screeners are stored in the current format (SCREENERS_VERSION)
    expect(params).toEqual([
      [
        [EVIL, "[]", 2, EVIL, 1000, 30, 7],
        ["b", "[]", 2, EVIL, 1000, 30, 7],
      ],
    ]);
  });

  it("updates and deletes only the owner's rows", async () => {
    await StrategyRepository.updateStrategy(3, 7, fields);
    const [sql, params] = lastCall(modify);
    expectNoValuesInSql(sql);
    expect(sql).toMatch(/where id = \? and user_id = \?$/);
    expect(params).toEqual([30, EVIL, "[]", 2, EVIL, 3, 7]);

    await StrategyRepository.deleteStrategies([3, 4], 7);
    expect(lastCall(modify)).toEqual(["delete from strategy where id in (?) and user_id = ?", [[3, 4], 7]]);
  });

  it("finds strategies by name for one user", async () => {
    await StrategyRepository.getByName([EVIL, "b"], 7);
    const [sql, params] = lastCall(query);
    expectNoValuesInSql(sql);
    expect(params).toEqual([[EVIL, "b"], 7]);
  });

  it("loads only the user's own strategies", async () => {
    query.mockResolvedValueOnce([]);
    await StrategyRepository.getOwnedStrategies([1, 2], 7);
    expect(lastCall(query)).toEqual(["select * from strategy where id in (?) and user_id = ?", [[1, 2], 7]]);
  });

  it("counts the runs and saved back tests that use the owner's strategies", async () => {
    await StrategyRepository.getHistoryCounts([3, 4], 7);
    const [sql, params] = lastCall(query);
    expectNoValuesInSql(sql);
    expect(params).toEqual([[3, 4], 7]);
    expect(sql).toMatch(/from live_job j where j\.strategy_id = s\.id/);
    expect(sql).toMatch(/from backtest_result b where b\.strategy_id = s\.id/);
    expect(sql).toMatch(/s\.user_id = \?$/);
  });

  it("skips the database for empty lists", async () => {
    await expect(StrategyRepository.getHistoryCounts([], 7)).resolves.toEqual([]);
    await expect(StrategyRepository.getStrategies([])).resolves.toEqual([]);
    await expect(StrategyRepository.getByName([], 7)).resolves.toEqual([]);
    await expect(StrategyRepository.getOwnedIds([], 7)).resolves.toEqual([]);
    await expect(StrategyRepository.getOwnedStrategies([], 7)).resolves.toEqual([]);
    await expect(StrategyRepository.deleteStrategies([], 7)).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(modify).not.toHaveBeenCalled();
  });
});
