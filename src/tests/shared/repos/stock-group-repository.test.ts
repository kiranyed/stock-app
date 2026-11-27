import { DatabaseAPI } from "../../../shared/services/db-api";
import StockGroupRepository from "../../../shared/services/repos/stock-group-repository";

jest.mock("../../../shared/services/db-api");

const query = DatabaseAPI.query as jest.Mock;
const insert = DatabaseAPI.insert as jest.Mock;
const modify = DatabaseAPI.modify as jest.Mock;
const EVIL = "x'; drop table user; --";

/** The SQL text never contains a caller's value; it travels as a parameter. */
const expectPlaceholders = (mock: jest.Mock, values: unknown[]) => {
  const [sql, params] = mock.mock.calls[0];
  expect(sql).not.toContain(EVIL);
  expect(sql).not.toMatch(/'/);
  expect(params).toEqual(values);
};

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([]);
  insert.mockResolvedValue(42);
  modify.mockResolvedValue(1);
});

describe("StockGroupRepository", () => {
  it("creates a group with placeholders and returns the new id", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    await expect(StockGroupRepository.createGroup(EVIL, ["AAPL", EVIL], 7)).resolves.toBe(42);
    expectPlaceholders(insert, [EVIL, JSON.stringify(["AAPL", EVIL]), 1000, 7]);
  });

  it("updates and deletes only the owner's rows", async () => {
    await StockGroupRepository.updateGroup(3, 7, EVIL, ["AAPL"]);
    expectPlaceholders(modify, [EVIL, '["AAPL"]', 3, 7]);
    expect(modify.mock.calls[0][0]).toMatch(/where id = \? and user_id = \?$/);

    modify.mockClear();
    await expect(StockGroupRepository.deleteGroups([3, 4], 7)).resolves.toBe(1);
    expectPlaceholders(modify, [[3, 4], 7]);
    expect(modify.mock.calls[0][0]).toMatch(/user_id = \?/);
  });

  it("looks groups up by name and owner with placeholders", async () => {
    await StockGroupRepository.getGroupByName(EVIL, 7);
    expectPlaceholders(query, [7, EVIL]);
    query.mockClear();
    await StockGroupRepository.getSymbolsFromGroup(EVIL, 7);
    expectPlaceholders(query, [EVIL, 7]);
  });

  it("reads the owned ids among a list", async () => {
    query.mockResolvedValue([{ id: 3 }]);
    await expect(StockGroupRepository.getOwnedIds([3, 4], 7)).resolves.toEqual([3]);
    expectPlaceholders(query, [[3, 4], 7]);
  });

  it("counts the runs and saved back tests that use the owner's groups", async () => {
    await StockGroupRepository.getHistoryCounts([3, 4], 7);
    expectPlaceholders(query, [[3, 4], 7]);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/from live_job j where j\.group_id = g\.id/);
    expect(sql).toMatch(/from backtest_result b where b\.group_id = g\.id/);
    expect(sql).toMatch(/g\.user_id = \?$/);
  });

  it("skips the database for empty id lists", async () => {
    await expect(StockGroupRepository.getGroups([])).resolves.toEqual([]);
    await expect(StockGroupRepository.getOwnedIds([], 7)).resolves.toEqual([]);
    await expect(StockGroupRepository.getHistoryCounts([], 7)).resolves.toEqual([]);
    await expect(StockGroupRepository.deleteGroups([], 7)).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(modify).not.toHaveBeenCalled();
  });

  it("passes database errors through", async () => {
    const failure = new Error("db down");
    insert.mockRejectedValue(failure);
    await expect(StockGroupRepository.createGroup("A", [], 1)).rejects.toBe(failure);
  });
});
