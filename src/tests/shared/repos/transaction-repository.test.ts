import { DatabaseAPI } from "../../../shared/services/db-api";
import TransactionRepository from "../../../shared/services/repos/transaction-repository";
import { ILiveJobRunEntity } from "../../../types/entity-types";

jest.mock("../../../shared/services/db-api");

describe("TransactionRepository", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("recordTransaction", () => {
    it("should record a transaction", async () => {
      const symbol = "AAPL";
      const datetime = 1622505600;
      const profit = 100;
      const percent = 10;
      const long = true;
      const runId = 1;
      const valueString = [symbol, datetime, profit, percent, long, runId]
        .map((param) => (typeof param === "string" ? `'${param}'` : param))
        .join(",");
      const query = `insert into transaction_real (symbol, datetime, net_gain, net_percent_gain, long, run_id) values (${valueString})`;

      await TransactionRepository.recordTransaction(
        symbol,
        datetime,
        profit,
        percent,
        long,
        runId,
      );

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });

    it("should throw an error if runId is 0", () => {
      expect(() => {
        TransactionRepository.recordTransaction(
          "AAPL",
          1622505600,
          100,
          10,
          true,
          0,
        );
      }).toThrow("runId not set");
    });
  });

  describe("recordTransactionSim", () => {
    it("should record a simulation transaction", async () => {
      const symbol = "AAPL";
      const datetime = 1622505600;
      const profit = 100;
      const percent = 10;
      const long = true;
      const runId = 1;
      const valueString = [symbol, datetime, profit, percent, long, runId]
        .map((param) => (typeof param === "string" ? `'${param}'` : param))
        .join(",");
      const query = `insert into transaction_sim (symbol, datetime, net_gain, net_percent_gain, long, run_id) values (${valueString})`;

      await TransactionRepository.recordTransactionSim(
        symbol,
        datetime,
        profit,
        percent,
        long,
        runId,
      );

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });

    it("should throw an error if runId is 0", () => {
      expect(() => {
        TransactionRepository.recordTransactionSim(
          "AAPL",
          1622505600,
          100,
          10,
          true,
          0,
        );
      }).toThrow("runId not set");
    });
  });

  describe("getTransactionsReal", () => {
    it("should get real transactions", async () => {
      const runIds = ["1", "2"];
      const datetime = 1622505600;
      const query = `select run_id, symbol, datetime, net_percent_gain from transaction_real where run_id in (${runIds.join(",")}) and datetime > ${datetime}`;

      await TransactionRepository.getTransactionsReal(runIds, datetime);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });

    it("should default datetime to 0 for real transactions", async () => {
      const runIds = ["1", "2"];
      const query = `select run_id, symbol, datetime, net_percent_gain from transaction_real where run_id in (${runIds.join(",")}) and datetime > 0`;

      await TransactionRepository.getTransactionsReal(runIds);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });
  });

  describe("getTransactionsSimulation", () => {
    it("should get simulation transactions", async () => {
      const runIds = ["1", "2"];
      const datetime = 1622505600;
      const query = `select run_id, symbol, datetime, net_percent_gain from transaction_sim where run_id in (${runIds.join(",")}) and datetime > ${datetime}`;

      await TransactionRepository.getTransactionsSimulation(runIds, datetime);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });

    it("should default datetime to 0 for simulation transactions", async () => {
      const runIds = ["1", "2"];
      const query = `select run_id, symbol, datetime, net_percent_gain from transaction_sim where run_id in (${runIds.join(",")}) and datetime > 0`;

      await TransactionRepository.getTransactionsSimulation(runIds);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });
  });

  describe("getTransactionsForRun", () => {
    it("should get transactions for a run", async () => {
      const runId = 1;
      const query = `select net_percent_gain from transaction_sim where run_id=${runId}`;

      await TransactionRepository.getTransactionsForRun(runId);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });
  });

  describe("getTotal", () => {
    it("should get total gain percent for runs", async () => {
      const runRows: ILiveJobRunEntity[] = [
        {
          id: 1,
          start_time: 0,
          end_time: 0,
          group_id: 0,
          status: "",
          position_size: 0,
          open_by: 0,
          strategy_id: 0,
          close_by: 0,
        },
        {
          id: 2,
          start_time: 0,
          end_time: 0,
          group_id: 0,
          status: "",
          position_size: 0,
          open_by: 0,
          strategy_id: 0,
          close_by: 0,
        },
      ];
      const query = `select SUM(net_percent_gain) as gainPercent, run_id from transaction_sim where run_id in (${runRows.map((row) => row.id).join(",")})`;

      await TransactionRepository.getTotal(runRows);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });
  });
});
