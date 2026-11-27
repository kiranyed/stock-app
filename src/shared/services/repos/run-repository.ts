import { ILiveJobRunEntity } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";
import PaperPositionRepository from "./paper-position-repository";

export type JobType = "simulation" | "real";
export type JobStatus = "active" | "paused" | "ended";

export interface ICurrentRun {
  id: number;
  status: JobStatus;
  startTime: number;
  strategyName: string;
  groupName: string;
}

/** An active or paused run, with the user who owns its strategy (null if the strategy is missing or unowned). */
export interface IUnfinishedRun extends ILiveJobRunEntity {
  owner_id: number | null;
}

/**
 * `live_job` rows. A run belongs to whoever owns its strategy: `strategy_id` is a
 * non-cascading foreign key, so the strategy always exists. Every value is a placeholder.
 */
export default class RunRepository {
  /** The run if `userId` owns it, else undefined. */
  public static async getOwnedRun(id: number, userId: number): Promise<ILiveJobRunEntity | undefined> {
    const [row] = await DatabaseAPI.query<ILiveJobRunEntity>(
      "select live_job.* from live_job join strategy on strategy.id = live_job.strategy_id " +
        "where live_job.id = ? and strategy.user_id = ?",
      [id, userId],
    );
    return row;
  }

  /** The runs among `ids` that `userId` owns. */
  public static getOwnedRuns(ids: number[], userId: number): Promise<ILiveJobRunEntity[]> {
    if (!ids.length) return Promise.resolve([]);
    return DatabaseAPI.query<ILiveJobRunEntity>(
      "select live_job.* from live_job join strategy on strategy.id = live_job.strategy_id " +
        "where live_job.id in (?) and strategy.user_id = ?",
      [ids, userId],
    );
  }

  /** The user's active and paused runs of one type. */
  public static getCurrentRuns(userId: number, jobType: JobType): Promise<ICurrentRun[]> {
    return DatabaseAPI.query<ICurrentRun>(
      "select live_job.id as id, live_job.status as status, live_job.start_time as startTime, " +
        "strategy.name as strategyName, stock_group.name as groupName from live_job " +
        "join strategy on strategy.id = live_job.strategy_id " +
        "join stock_group on stock_group.id = live_job.group_id " +
        "where strategy.user_id = ? and live_job.job_type = ? and live_job.status in ('active', 'paused')",
      [userId, jobType],
    );
  }

  /** Every user's active and paused runs that started before `before`, oldest first. */
  public static getUnfinishedRuns(before: number): Promise<IUnfinishedRun[]> {
    return DatabaseAPI.query<IUnfinishedRun>(
      "select live_job.*, strategy.user_id as owner_id from live_job " +
        "left join strategy on strategy.id = live_job.strategy_id " +
        "where live_job.status in ('active', 'paused') and live_job.start_time < ? order by live_job.id",
      [before],
    );
  }

  /** Inserts one active run per strategy and returns the new rows. */
  public static async createRuns(
    strategyIds: number[],
    groupId: number,
    jobType: JobType,
    notifyOnEntry = false,
  ): Promise<ILiveJobRunEntity[]> {
    if (!strategyIds.length) return [];
    const now = Date.now();
    const ids: number[] = [];
    for (const strategyId of strategyIds) {
      ids.push(
        await DatabaseAPI.insert(
          "insert into live_job (strategy_id, group_id, start_time, status, job_type, notify_on_entry) " +
            "values (?, ?, ?, 'active', ?, ?)",
          [strategyId, groupId, now, jobType, notifyOnEntry],
        ),
      );
    }
    return DatabaseAPI.query<ILiveJobRunEntity>("select * from live_job where id in (?) order by id", [ids]);
  }

  /** Moves a run from one status to another; returns 0 if it wasn't in `from`. */
  /** Moves the run from one of `from` to `to`. Ending a live run also means forgetting its positions: see `forgetPositions`. */
  public static setStatus(id: number, from: JobStatus[], to: JobStatus): Promise<number> {
    const endTime = to === "ended" ? Date.now() : null;
    return DatabaseAPI.modify(
      "update live_job set status = ?, end_time = coalesce(?, end_time) where id = ? and status in (?)",
      [to, endTime, id, from],
    );
  }

  /**
   * Deletes ended runs' open positions. Never rejects: the runs are already ended, so a failure
   * is logged and only leaves rows nothing reads.
   */
  public static async forgetPositions(ids: number[]): Promise<void> {
    try {
      await PaperPositionRepository.deleteForRuns(ids);
    } catch (err) {
      console.error(`Couldn't delete the open positions of ended runs ${ids.join(", ")}`, err);
    }
  }

  /** Ends whichever of `ids` are still active or paused, and forgets their open positions. */
  public static async endRuns(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const changed = await DatabaseAPI.modify(
      "update live_job set status = 'ended', end_time = ? where id in (?) and status in ('active', 'paused')",
      [Date.now(), ids],
    );
    await this.forgetPositions(ids);
    return changed;
  }
}
