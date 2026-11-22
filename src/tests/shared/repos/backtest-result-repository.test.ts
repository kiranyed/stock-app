import BacktestResultRepository, {
  BacktestResultInsert,
} from "../../../shared/services/repos/backtest-result-repository";
import { DatabaseAPI } from "../../../shared/services/db-api";

jest.mock("../../../shared/services/db-api");

describe("BacktestResultRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inserts a backtest result with escaped params", async () => {
    (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue([]);

    const payload: BacktestResultInsert = {
      strategyId: 1,
      groupId: 2,
      strategyName: "strat",
      groupName: "group",
      startTime: 100,
      endTime: 200,
      period: 5,
      direction: "long",
      params: { m: 2, n: 3 },
      returnPct: 12.34,
      winRate: 55.6,
      trades: 10,
      sharpe: 1.2,
      maxDrawdown: 4.5,
      dataSource: "Schwab",
      status: "SUCCESS",
      runtimeMs: 1234,
      createdAt: 999,
    };

    await BacktestResultRepository.insert(payload);

    expect(DatabaseAPI.runQuery).toHaveBeenCalledTimes(1);
    const sql = (DatabaseAPI.runQuery as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO backtest_result");
    expect(sql).toContain("strat");
    expect(sql).toContain("group");
    expect(sql).toContain("Schwab");
    expect(sql).toContain('\\"m\\":2');
    expect(sql).toContain('\\"n\\":3');
  });

  it("queries completed backtest results by group id", async () => {
    (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue([]);

    await BacktestResultRepository.getCompletedByGroup(44);

    expect(DatabaseAPI.runQuery).toHaveBeenCalledTimes(1);
    const sql = (DatabaseAPI.runQuery as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("FROM backtest_result");
    expect(sql).toContain("group_id = 44");
    expect(sql).toContain("status = 'SUCCESS'");
    expect(sql).toContain("ORDER BY created_at DESC");
  });

  it("queries completed backtest results by group id and strategy ids", async () => {
    (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue([]);

    await BacktestResultRepository.getCompletedByGroup(44, [12, 14]);

    expect(DatabaseAPI.runQuery).toHaveBeenCalledTimes(1);
    const sql = (DatabaseAPI.runQuery as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("group_id = 44");
    expect(sql).toContain("strategy_id IN (12, 14)");
    expect(sql).toContain("status = 'SUCCESS'");
  });
});
