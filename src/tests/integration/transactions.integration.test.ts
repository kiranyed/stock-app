import * as dotenv from "dotenv";
import { DatabaseAPI } from "../../shared/services/db-api";
import TransactionRepository from "../../shared/services/repos/transaction-repository";
import RunRepository from "../../shared/services/repos/run-repository";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import UserRepository from "../../shared/services/repos/user-repository";
import { TransactionService } from "../../services/transaction-service";

// Records and reads transactions against real MySQL inside a rolled-back transaction.
// Recording used to fail on every insert: the reserved word `long` wasn't quoted, and
// net_percent_gain (DECIMAL(3,2)) couldn't hold 10% or more (db/widen-transaction-percent.sql).
describe("Integration - Transactions", () => {
  let owner = -1;
  let other = -1;
  let simRun = -1;

  beforeAll(async () => {
    dotenv.config();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
    const stamp = Date.now();
    ({ insertId: owner } = await UserRepository.createUser(`txowner${stamp}`, "x"));
    ({ insertId: other } = await UserRepository.createUser(`txother${stamp}`, "x"));
    const { insertId: strategy } = await StrategyRepository.createStrategy(
      [{ name: "tx it", description: "", period: 1440, screeners: [] }],
      owner,
    );
    const group = await StockGroupRepository.createGroup("tx it", ["AAPL"], owner);
    [{ id: simRun }] = await RunRepository.createRuns([strategy], group, "simulation");
  }, 60000);

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });

  it("records simulated trades, including gains of 10% or more", async () => {
    expect(await TransactionRepository.recordTransactionSim("AAPL", 2000, 150.25, 12.5, true, simRun)).toEqual(expect.any(Number));
  });

  it("lets the owner read transactions with the run id and numeric gains", async () => {
    const [sim] = await TransactionService.list(owner, "simulation", [simRun], 0);
    expect(sim).toMatchObject({ runId: simRun, symbol: "AAPL", netGain: 150.25, netPercentGain: 12.5, long: true });
  });

  it("shows another user nothing, and only rows after pingTime", async () => {
    expect(await TransactionService.list(other, "simulation", [simRun], 0)).toEqual([]);
    expect(await TransactionService.list(owner, "simulation", [simRun], 2000)).toEqual([]);
  });
});
