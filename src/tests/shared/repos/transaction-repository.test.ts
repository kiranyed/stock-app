import { DatabaseAPI } from "../../../shared/services/db-api";
import TransactionRepository from "../../../shared/services/repos/transaction-repository";

jest.mock("../../../shared/services/db-api");

const insert = DatabaseAPI.insert as jest.Mock;
const query = DatabaseAPI.query as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("TransactionRepository recording", () => {
  it("records a simulation transaction with placeholders and a quoted `long`", async () => {
    insert.mockResolvedValue(11);
    await expect(TransactionRepository.recordTransactionSim("AAPL", 1000, 25.5, 12.5, true, 7)).resolves.toBe(11);
    const [sql, params] = insert.mock.calls[0];
    expect(sql).toBe(
      "insert into transaction_sim (symbol, datetime, net_gain, net_percent_gain, `long`, run_id) values (?, ?, ?, ?, ?, ?)",
    );
    expect(params).toEqual(["AAPL", 1000, 25.5, 12.5, true, 7]);
  });

  it("logs instead of rejecting when the insert fails, so the trading loop can't crash", async () => {
    insert.mockRejectedValue(Object.assign(new Error("parse error"), { code: "ER_PARSE_ERROR" }));
    await expect(TransactionRepository.recordTransactionSim("AAPL", 1, 1, 1, true, 7)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("run 7 (AAPL)"), expect.any(Error));
  });

  it("refuses a missing run id without touching the database", async () => {
    await expect(TransactionRepository.recordTransactionSim("AAPL", 1, 1, 1, true, 0)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("TransactionRepository.getOwnedTransactions", () => {
  it("reads simulation transactions only through the run's strategy owner", async () => {
    query.mockResolvedValue([]);
    await TransactionRepository.getOwnedTransactions("simulation", [1, 2], 7, 500);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("from transaction_sim t");
    expect(sql).toMatch(/join live_job j on j.id = t.run_id join strategy s on s.id = j.strategy_id/);
    expect(sql).toMatch(/t.run_id in \(\?\) and s.user_id = \? and t.datetime > \?/);
    expect(params).toEqual([[1, 2], 7, 500]);
  });

  it("skips the database for no run ids", async () => {
    await expect(TransactionRepository.getOwnedTransactions("simulation", [], 7)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
