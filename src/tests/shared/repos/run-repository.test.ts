import { DatabaseAPI } from "../../../shared/services/db-api";
import RunRepository from "../../../shared/services/repos/run-repository";

jest.mock("../../../shared/services/db-api");

describe("RunRepository", () => {
  const defaultDateTimeStamp = 1609459200000;
  beforeAll(() => {
    // Mock Date.now() to return a fixed value
    jest.spyOn(Date, "now").mockImplementation(() => defaultDateTimeStamp); // Example timestamp
  });

  describe("createRealStrategyRun", () => {
    it("should create a real strategy run", async () => {
      const stratId = 1;
      const groupId = 1;
      const query = `insert into live_job (strategy_id, group_id, start_time, status, job_type) values(${stratId},${groupId},${Date.now()},'active', 'real'); SELECT LAST_INSERT_ID()`;

      await RunRepository.createRealStrategyRun(stratId, groupId);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
    });
  });

  describe("createRealStrategyRuns", () => {
    it("should create multiple real strategy runs", async () => {
      const stratIds = [1, 2];
      const groupId = 1;
      const query1 = `INSERT INTO live_job (strategy_id, group_id, start_time, status, job_type)
        VALUES ${stratIds.map((id) => `(${id}, ${groupId}, ${Date.now()}, 'active', 'real')`).join(",")}`;
      const query2 = `SELECT * 
        FROM live_job
        WHERE id >= LAST_INSERT_ID() 
        AND id < LAST_INSERT_ID() + ROW_COUNT();`;

      await RunRepository.createRealStrategyRuns(stratIds, groupId);

      expect(DatabaseAPI.runTwoStatements).toHaveBeenCalledWith(query1, query2);
    });
  });
});
