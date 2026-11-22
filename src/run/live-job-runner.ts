import { StrategyType } from "../shared/constants";
import { StrategyScheduler } from "./strategy-scheduler";
import { DatabaseAPI } from "../shared/services/db-api";
import { IStockGroup, ILiveJobRunEntity } from "../types/entity-types";
import TransactionRepository from "../shared/services/repos/transaction-repository";
import RunRepository from "../shared/services/repos/run-repository";
import { LiveMasterJob } from "../shared/classes/live-master-job";
import { ILiveStockScreenerJob } from "../types/data-processing-types";
import { HistoricalWarmupService } from "./historical-warmup-service";

/* breaup this up -- live job runner abstract class
sub class screener strategu runner*/

export class LiveJobRunner {
  scheduler: StrategyScheduler = new StrategyScheduler(StrategyType.SIMULATION);
  private masterJob: LiveMasterJob = new LiveMasterJob([], {
    id: -1,
    name: "",
    symbols: [],
  });

  public constructor() {}

  static instance: LiveJobRunner;

  static getInstance() {
    if (!this.instance) {
      this.instance = new LiveJobRunner();
    }
    return this.instance;
  }

  public clean() {
    /* update live_job (SELECT AVG(column_name) FROM table_name where run ids in ())
     */
    DatabaseAPI.runQuery<ILiveJobRunEntity>(
      "select * from live_job where job_type='simulation' and status in ('active','paused')",
    )
      .then((rows) => {
        if (rows.length) {
          return TransactionRepository.getTotal(rows)
            .then((rows) => {
              const promises = rows.map((result) =>
                DatabaseAPI.runQuery(
                  "update live_job set status='ended', end_time=" +
                    Date.now() +
                    ", gain_percent=" +
                    result.gainPercent +
                    " where id='" +
                    result.id +
                    "'",
                ),
              );
              return Promise.all(promises);
            })
            .catch((err) => {
              throw err;
            });
        }
      })
      .catch((err) => {
        throw err;
      });
  }

  public async runJobs(
    jobs: ILiveStockScreenerJob[],
    group: IStockGroup,
    type = StrategyType.SIMULATION,
  ): Promise<ILiveJobRunEntity[]> {
    const masterJob = this.masterJob;

    // this is the one thing left to do...
    const stratIds = jobs.map((job) => job.getConfigId());
    const runEntities =
      type === StrategyType.REAL
        ? await RunRepository.createRealStrategyRuns(stratIds, group.id)
        : await RunRepository.createSimulationRuns(stratIds, group.id);

    /* this is assuming that there's 1 strategy for 1 strategy run.  which is true
        in this case, but may not be true later on
        */

    for (const job of jobs) {
      // when getConfigId() returns -1, this is an analysis not a strategy, so i'm only passing one of them
      //  for now
      if (job.getConfigId() === -1) {
        job.setId(runEntities[0].id);
      } else {
        const entity = runEntities.find(
          (entity) => entity.strategy_id === job.getConfigId(),
        );
        if (entity?.id) {
          job.setId(entity.id);
        } else {
          throw new Error(
            `could not find run entity for strategy id ${job.getConfigId()}`,
          );
        }
      }
    }

    if (!masterJob.isInitialized()) {
      this.masterJob = new LiveMasterJob(jobs, group);
      const slice = this.masterJob.prepare(jobs);
      const warmedSlice = await HistoricalWarmupService.warmInitializedSlice(
        jobs,
        group,
        slice,
      );
      this.masterJob.mergeInitializedSlice(warmedSlice);
      this.scheduler.scheduleStrategies(this.masterJob);
    } else {
      const slice = this.masterJob.prepare(jobs);
      const warmedSlice = await HistoricalWarmupService.warmInitializedSlice(
        jobs,
        group,
        slice,
      );
      this.masterJob.mergeInitializedSlice(warmedSlice);
      this.masterJob.addJobs(jobs);
    }
    return runEntities;
  }

  pauseStrategy(id: number) {
    this.masterJob.pause(id);
  }

  resumeStrategy(id: number) {
    this.masterJob.resume(id);
  }

  endStrategy(id: number) {
    this.masterJob.end(id);
  }

  getJobByRunId(id: number) {
    return [...this.masterJob.jobs, ...this.masterJob.pausedJobs].find(
      (job) => job.getId() === id,
    );
  }

  stopAll() {
    this.scheduler.stopAll();
    this.masterJob.endAll();
  }
}
