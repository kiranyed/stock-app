import BacktestResultRepository, {
  BacktestResultInsert,
} from "../../../shared/services/repos/backtest-result-repository";
import { DatabaseAPI } from "../../../shared/services/db-api";

jest.mock("../../../shared/services/db-api");

const insert = DatabaseAPI.insert as jest.Mock;
const query = DatabaseAPI.query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("BacktestResultRepository", () => {
  it("inserts a result with every value as a placeholder", async () => {
    insert.mockResolvedValue(9);
    const payload: BacktestResultInsert = {
      strategyId: 1,
      groupId: 2,
      strategyName: "strat'); drop table strategy; --",
      groupName: "group",
      startTime: 100,
      endTime: 200,
      period: 5,
      params: { m: 2 },
      returnPct: 12.34,
      winRate: 55.6,
      trades: 10,
      maxDrawdown: 4.5,
      createdAt: 999,
    };

    await expect(BacktestResultRepository.insert(payload)).resolves.toBe(9);
    const [sql, params] = insert.mock.calls[0];
    expect(sql).not.toContain("drop table");
    expect(sql.match(/\?/g)).toHaveLength(18);
    expect(params).toEqual([
      1, 2, payload.strategyName, "group", 100, 200, 5, null, '{"m":2}', 12.34, 55.6, 10, null, 4.5, null, "SUCCESS", null, 999,
    ]);
  });

  it("returns only the user's results for a group", async () => {
    query.mockResolvedValue([]);
    await BacktestResultRepository.getCompletedByGroup(7, 44);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/join strategy s on s.id = r.strategy_id/);
    expect(sql).toMatch(/r.group_id = \? and s.user_id = \? and r.status = 'SUCCESS'/);
    expect(sql).not.toMatch(/strategy_id in/);
    expect(params).toEqual([44, 7]);
  });

  it("filters by strategy ids when given", async () => {
    query.mockResolvedValue([]);
    await BacktestResultRepository.getCompletedByGroup(7, 44, [12, 14]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/r.strategy_id in \(\?\)/);
    expect(params).toEqual([44, 7, [12, 14]]);
  });
});
