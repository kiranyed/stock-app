import { StrategyScheduler } from "./strategy-scheduler";
import { IStockGroup, ILiveJobRunEntity } from "../types/entity-types";
import RunRepository from "../shared/services/repos/run-repository";
import { LiveMasterJob } from "../shared/classes/live-master-job";
import { ILiveStockScreenerJob } from "../types/data-processing-types";
import { HistoricalWarmupService } from "./historical-warmup-service";

/* breaup this up -- live job runner abstract class
sub class screener strategu runner*/

export class LiveJobRunner {
  scheduler = new StrategyScheduler();
  private masterJob: LiveMasterJob = new LiveMasterJob([], {
    id: -1,
    name: "",
    symbols: [],
  });

  /** Run ids being warmed up, and those of them ended meanwhile (which must not be added). */
  private loading = new Set<number>();
  private endedWhileLoading = new Set<number>();

  public constructor() {}

  static instance: LiveJobRunner;

  static getInstance() {
    if (!this.instance) {
      this.instance = new LiveJobRunner();
    }
    return this.instance;
  }

  public async runJobs(
    jobs: ILiveStockScreenerJob[],
    group: IStockGroup,
    notifyOnEntry = false,
  ): Promise<ILiveJobRunEntity[]> {
    const stratIds = jobs.map((job) => job.getConfigId());
    const runEntities = await RunRepository.createRuns(
      stratIds,
      group.id,
      "simulation",
      notifyOnEntry,
    );

    try {
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
      await this.load(jobs, group, new Set());
    } catch (err) {
      // the rows are already in the database; don't leave them active with nothing running
      await RunRepository.endRuns(runEntities.map((e) => e.id)).catch((endErr) =>
        console.error("Failed to end runs after a failed start", endErr),
      );
      throw err;
    }
    return runEntities;
  }

  /** Loads runs that already have ids, after a restart. Runs whose ids are in `pausedIds` start paused. */
  restoreJobs(jobs: ILiveStockScreenerJob[], group: IStockGroup, pausedIds: Set<number>) {
    return this.load(jobs, group, pausedIds);
  }

  private async load(jobs: ILiveStockScreenerJob[], group: IStockGroup, pausedIds: Set<number>) {
    const ids = jobs.map((job) => job.getId());
    ids.forEach((id) => this.loading.add(id));
    let warmed;
    let ended = new Set<number>();
    try {
      warmed = await HistoricalWarmupService.warm(jobs, group);
    } finally {
      ids.forEach((id) => this.loading.delete(id));
      ended = new Set(ids.filter((id) => this.endedWhileLoading.delete(id)));
    }
    // everything below is synchronous, so it sees this.masterJob as it is now
    const keep = jobs.filter((job) => !ended.has(job.getId()));
    if (!keep.length) return;
    const active = keep.filter((job) => !pausedIds.has(job.getId()));
    const paused = keep.filter((job) => pausedIds.has(job.getId()));
    if (!this.masterJob.isInitialized()) {
      this.masterJob = new LiveMasterJob([], group);
      this.masterJob.addJobs(active, group, warmed, paused);
      this.scheduler.scheduleStrategies(this.masterJob);
    } else {
      this.masterJob.addJobs(active, group, warmed, paused);
    }
  }

  pauseStrategy(id: number) {
    this.masterJob.pause(id);
  }

  resumeStrategy(id: number) {
    this.masterJob.resume(id);
  }

  endStrategy(id: number) {
    if (this.loading.has(id)) this.endedWhileLoading.add(id);
    else this.masterJob.end(id);
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
