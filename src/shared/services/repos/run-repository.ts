import { IStrategyRun, ILiveJobRunEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class RunRepository {
  private static runQuery<T>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }

  private static runTwoQueries<T>(query1: string, query2: string) {
    return DatabaseAPI.runTwoStatements<T>(query1, query2);
  }

  private static runQuerySelect(query: string) {
    return this.runQuery<IStrategyRun>(query);
  }

  public static getRun(stratId: number) {
    return this.runQuery(`select * from live_job where id=${stratId}`);
  }

  public static getRuns(stratIds: number[]) {
    return this.runQuery(
      `select * from live_job where id in (${stratIds.join(",")})`,
    );
  }

  public static setGainForRun(runId: number, percent: number) {
    return this.runQuery(
      `update live_job set gain_percent=${percent} where id=${runId}`,
    );
  }

  public static getCurrentRunningSimulations() {
    return this.runQuery(
      "select live_job.id as id, live_job.status as status, live_job.start_time as startTime, strategy.name as strategyName, stock_group.name as groupName from live_job join strategy on strategy.id=live_job.strategy_id join stock_group on stock_group.id=live_job.group_id where live_job.job_type='simulation' and live_job.status in ('active','paused')",
    );
  }

  public static getCurrentRealStrategies() {
    return this.runQuery(
      "select live_job.id as id, live_job.status as status, live_job.start_time as startTime, strategy.name as strategyName, stock_group.name as groupName from live_job join strategy on strategy.id=live_job.strategy_id join stock_group on stock_group.id=live_job.group_id where live_job.job_type='real' and live_job.status in ('active','paused')",
    );
  }

  public static createSimulationRun(stratId: string, groupId: string) {
    return this.runQuery(
      "insert into live_job (strategy_id, group_id, start_time, status, job_type)" +
        "values(" +
        stratId +
        "," +
        groupId +
        "," +
        Date.now() +
        ",'active', 'simulation'); SELECT LAST_INSERT_ID()",
    );
  }

  public static async createSimulationRuns(
    stratIds: number[],
    groupId: number,
  ): Promise<ILiveJobRunEntity[]> {
    const query1 = `INSERT INTO live_job (strategy_id, group_id, start_time, status, job_type)
        VALUES ${stratIds.map((id) => `(${id}, ${groupId}, ${Date.now()}, 'active', 'simulation')`).join(",")}`;
    const query2 = `SELECT * 
        FROM live_job
        WHERE id >= LAST_INSERT_ID() 
        AND id < LAST_INSERT_ID() + ROW_COUNT();`;
    return this.runTwoQueries(query1, query2);
  }

  public static createRealStrategyRun(stratId: number, groupId: number) {
    return this.runQuery(
      "insert into live_job (strategy_id, group_id, start_time, status, job_type) values(" +
        stratId +
        "," +
        groupId +
        "," +
        Date.now() +
        ",'active', 'real'); SELECT LAST_INSERT_ID()",
    );
  }

  public static async createRealStrategyRuns(
    stratIds: number[],
    groupId: number,
  ): Promise<ILiveJobRunEntity[]> {
    const query1 = `INSERT INTO live_job (strategy_id, group_id, start_time, status, job_type)
        VALUES ${stratIds.map((id) => `(${id}, ${groupId}, ${Date.now()}, 'active', 'real')`).join(",")}`;
    const query2 = `SELECT * 
        FROM live_job
        WHERE id >= LAST_INSERT_ID() 
        AND id < LAST_INSERT_ID() + ROW_COUNT();`;
    return await this.runTwoQueries(query1, query2);
  }

  public static endSimulationRun(runId: number) {
    return this.runQuery(
      `update live_job set end_time=${Date.now()}, status='ended' where id=${runId}`,
    );
  }

  public static endRealStrategyRun(runId: number) {
    return this.runQuery(
      `update live_job set end_time=${Date.now()}, status='ended' where id=${runId}`,
    );
  }

  public static endJob(runId: number) {
    return this.runQuery(
      `update live_job set status='ended' where id=${runId}`,
    );
  }

  public static resumeJob(runId: number) {
    return this.runQuery(
      `update live_job set status='active' where id=${runId}`,
    );
  }

  public static pauseJob(runId: number) {
    return this.runQuery(
      `update live_job set status='paused' where id=${runId}`,
    );
  }
}
