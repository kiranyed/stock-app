import { CONSTANTS, StrategyType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { SchwabAPI } from "../shared/services/trading-api";
import MasterJob from "../shared/classes/master-job";
import { IJob } from "../types/data-processing-types";

enum DAY {
  SUNDAY,
  MONDAY,
  TUESDAY,
  WEDNESDAY,
  THURSDAY,
  FRIDAY,
  SATURDAY,
}

export class StrategyScheduler {
  type: StrategyType;

  constructor(type: StrategyType) {
    this.type = type;
  }

  screeningIntervalSim: NodeJS.Timeout | undefined;
  screeningIntervalReal: NodeJS.Timeout | undefined;
  screeningIntervalSimDayInt: NodeJS.Timeout | undefined;
  delayedStartTimeout: NodeJS.Timeout | undefined;
  private lifecycleId = 0;

  private getScreeningInterval() {
    return this.type === StrategyType.SIMULATION
      ? this.screeningIntervalSim
      : this.screeningIntervalReal;
  }

  private setScreeningInterval(interval: NodeJS.Timeout | undefined) {
    if (this.type === StrategyType.SIMULATION) {
      this.screeningIntervalSim = interval;
    } else {
      this.screeningIntervalReal = interval;
    }
  }

  stopAll() {
    this.lifecycleId += 1;

    console.debug("[StrategyScheduler] stopAll invoked", {
      lifecycleId: this.lifecycleId,
      type: this.type,
      hadMinuteInterval: Boolean(this.getScreeningInterval()),
      hadDayInterval: Boolean(this.screeningIntervalSimDayInt),
      hadDelayedStartTimeout: Boolean(this.delayedStartTimeout),
    });

    const interval = this.getScreeningInterval();
    if (interval) {
      clearInterval(interval);
      this.setScreeningInterval(undefined);
    }

    if (this.screeningIntervalSimDayInt) {
      clearInterval(this.screeningIntervalSimDayInt);
      this.screeningIntervalSimDayInt = undefined;
    }

    if (this.delayedStartTimeout) {
      clearTimeout(this.delayedStartTimeout);
      this.delayedStartTimeout = undefined;
    }
  }

  private async startIntervals(job: IJob, lifecycleId: number) {
    const { END_TIME, MILLIS_IN_MINUTE, MILLIS_IN_DAY } = CONSTANTS;
    /* need to handle situation where user adds new simulation that has a min period that is less
        than the current.  Or, just use minute intervals.. */

    // const endTime = type === 'simulation' ? SIM_END_TIME : END_TIME;
    const startDate = new Date();
    const initialOffset = startDate.getTimezoneOffset();

    console.debug("[StrategyScheduler] startIntervals", {
      lifecycleId,
      activeLifecycleId: this.lifecycleId,
      type: this.type,
      startedAt: startDate.toISOString(),
      initialOffset,
    });

    //TODO get rid of this
    const prepareJob = async () => {
      if (lifecycleId !== this.lifecycleId) {
        console.debug("[StrategyScheduler] prepareJob skipped due to stale lifecycle", {
          lifecycleId,
          activeLifecycleId: this.lifecycleId,
        });
        return;
      }

      // this crashes the whole app if schwab api returns 401
      const marketOpen = await SchwabAPI.isMarketOpen();

      console.debug("[StrategyScheduler] market open check", {
        lifecycleId,
        activeLifecycleId: this.lifecycleId,
        marketOpen,
      });

      if (lifecycleId !== this.lifecycleId) {
        console.debug("[StrategyScheduler] prepareJob aborted after market check; stale lifecycle", {
          lifecycleId,
          activeLifecycleId: this.lifecycleId,
        });
        return;
      }

      if (marketOpen) {
        const interval = setInterval(async () => {
          try {
            if (lifecycleId !== this.lifecycleId) {
              clearInterval(interval);
              return;
            }

            const ecm2 = StockTradeUtil.getMinutesInDayEastCoastSlow();
            console.debug("[StrategyScheduler] minute tick", {
              lifecycleId,
              activeLifecycleId: this.lifecycleId,
              eastCoastMinute: ecm2,
              endTime: END_TIME,
            });
            if (ecm2 >= END_TIME) {
              if (job.clearIntradayStateData) {
                job.clearIntradayStateData();
              }
              clearInterval(interval);
              this.setScreeningInterval(undefined);
              console.debug("[StrategyScheduler] stopped minute interval at end of trading window", {
                lifecycleId,
                eastCoastMinute: ecm2,
              });
            } else {
              console.debug("[StrategyScheduler] executing scheduled job.run", {
                lifecycleId,
                eastCoastMinute: ecm2,
              });
              await job.run();
            }
          } catch (error) {
            console.log("Error in startIntervals(), prepareJob(), " + error);
            clearInterval(interval);
            this.setScreeningInterval(undefined);
          }
        }, MILLIS_IN_MINUTE);
        this.setScreeningInterval(interval);
        console.debug("[StrategyScheduler] minute interval started", {
          lifecycleId,
          intervalMs: MILLIS_IN_MINUTE,
        });
        const newDate = new Date();
        if (newDate.getTimezoneOffset() !== initialOffset) {
          // restartIntervalWithNewOffset(); /* TODO CHANGE THIS*/
        }

        if (lifecycleId !== this.lifecycleId) {
          clearInterval(interval);
          this.setScreeningInterval(undefined);
          console.debug("[StrategyScheduler] minute interval cleared; stale lifecycle detected", {
            lifecycleId,
            activeLifecycleId: this.lifecycleId,
          });
          return;
        }

        console.debug("[StrategyScheduler] running immediate job.run after interval setup", {
          lifecycleId,
        });
        await job.run();
      }
    };
    if (this.screeningIntervalSimDayInt) {
      clearInterval(this.screeningIntervalSimDayInt);
      this.screeningIntervalSimDayInt = undefined;
    }
    this.screeningIntervalSimDayInt = setInterval(async () => {
      try {
        if (lifecycleId !== this.lifecycleId) {
          if (this.screeningIntervalSimDayInt) {
            clearInterval(this.screeningIntervalSimDayInt);
            this.screeningIntervalSimDayInt = undefined;
          }
          return;
        }

        console.debug("[StrategyScheduler] daily interval tick", {
          lifecycleId,
          activeLifecycleId: this.lifecycleId,
        });

        await prepareJob();
      } catch (error) {
        console.log("Error in daily interval: " + error);
        if (this.screeningIntervalSimDayInt) {
          clearInterval(this.screeningIntervalSimDayInt);
          this.screeningIntervalSimDayInt = undefined;
        }
      }
    }, MILLIS_IN_DAY);

    console.debug("[StrategyScheduler] daily interval started", {
      lifecycleId,
      intervalMs: MILLIS_IN_DAY,
    });

    await prepareJob();
  }

  async scheduleStrategies(job: MasterJob, defaultTimeUntilStart?: number) {
    const lifecycleId = ++this.lifecycleId;

    const { BEGIN_TIME, END_TIME, MILLIS_IN_MINUTE, MILLIS_IN_DAY, MINS_IN_DAY } = CONSTANTS;
    const begin = BEGIN_TIME;
    const end = END_TIME;
    const EIGHT_AM_EST_MINUTES = 8 * 60; // 480 minutes

    let timeUntilStart = defaultTimeUntilStart ? defaultTimeUntilStart : 0;

    const eastCoastMinutes = StockTradeUtil.getMinutesInDayEastCoastSlow();
    if (!timeUntilStart) {
      timeUntilStart =
        eastCoastMinutes < begin
          ? begin - eastCoastMinutes
          : eastCoastMinutes >= end
            ? MINS_IN_DAY - (eastCoastMinutes - begin)
            : 0;
      timeUntilStart *= MILLIS_IN_MINUTE;
    }

    console.debug("[StrategyScheduler] scheduleStrategies", {
      lifecycleId,
      type: this.type,
      defaultTimeUntilStart,
      computedTimeUntilStart: timeUntilStart,
    });

    // Schedule daily maintenance at 8 AM EST
    const minsUntil8am =
      eastCoastMinutes < EIGHT_AM_EST_MINUTES
        ? EIGHT_AM_EST_MINUTES - eastCoastMinutes
        : MINS_IN_DAY - (eastCoastMinutes - EIGHT_AM_EST_MINUTES);
    const msUntil8am = minsUntil8am * MILLIS_IN_MINUTE;
    setTimeout(() => {
      if (lifecycleId !== this.lifecycleId) return;
      job.runDailyMaintenance();
      const maintenanceInterval = setInterval(() => {
        if (lifecycleId !== this.lifecycleId) {
          clearInterval(maintenanceInterval);
          return;
        }
        job.runDailyMaintenance();
      }, MILLIS_IN_DAY);
    }, msUntil8am);

    this.delayedStartTimeout = setTimeout(() => {
      if (lifecycleId !== this.lifecycleId) {
        console.debug("[StrategyScheduler] delayed start skipped due to stale lifecycle", {
          lifecycleId,
          activeLifecycleId: this.lifecycleId,
        });
        return;
      }

      console.debug("[StrategyScheduler] delayed start firing", {
        lifecycleId,
        type: this.type,
      });

      this.startIntervals(job, lifecycleId).catch((error) => {
        console.log("Error in delayed startIntervals: " + error);
      });
      this.delayedStartTimeout = undefined;
    }, timeUntilStart);
  }

  private inTradingTime(currentTime: number, offset: number) {
    const currentDate = new Date(currentTime);
    const todaysMinutes = StockTradeUtil.getMinutesInDay(currentDate);
    const retVal =
      (currentDate.getDay() + 1) % 7 > 1 &&
      todaysMinutes + offset >= CONSTANTS.BEGIN_TIME &&
      todaysMinutes + offset < CONSTANTS.END_TIME;
    return retVal;
  }

  private adjustDayLightSavings(
    currentTime: number,
    adjustment: number,
    offset: number,
    testStartTime: number,
  ) {
    currentTime += this.getTimeUntilNextTradingTime(currentTime);
    const { MILLIS_IN_DAY, MILLIS_IN_HOUR } = CONSTANTS;
    const test = (currentTime - (testStartTime + adjustment)) % MILLIS_IN_DAY;
    if (test === MILLIS_IN_HOUR) {
      adjustment = MILLIS_IN_HOUR;
      offset = StockTradeUtil.computeOffset(currentTime);
    } else if (test === CONSTANTS.MILLIS_IN_DAY - CONSTANTS.MILLIS_IN_HOUR) {
      adjustment = -MILLIS_IN_HOUR;
      offset = StockTradeUtil.computeOffset(currentTime);
    } else if (test !== 0) {
      console.log(
        "shouldn    t be here (the last else if statement in StrategyScheduler.adjustDayLightSavings())",
      );
    }
    return [adjustment, offset];
  }

  private getTimeUntilNextTradingTime(currentTime: number) {
    let time = 0;
    const currentDate = StockTradeUtil.getEastCoastDate(new Date(currentTime));
    const curDay = currentDate.getDay();
    const mins = StockTradeUtil.getMinutesInDay(currentDate);
    const { MINS_IN_DAY, BEGIN_TIME, END_TIME, MILLIS_IN_MINUTE } = CONSTANTS;
    if (curDay === DAY.SUNDAY) {
      if (mins < BEGIN_TIME) {
        time = MINS_IN_DAY + (BEGIN_TIME - mins);
      } else {
        time = MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    } else if (curDay === DAY.SATURDAY) {
      if (mins < BEGIN_TIME) {
        time = 2 * MINS_IN_DAY + (BEGIN_TIME - mins);
      } else {
        time = 2 * MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    } else if (curDay === DAY.FRIDAY && mins >= END_TIME) {
      if (mins >= END_TIME) {
        time = MINS_IN_DAY - (mins - BEGIN_TIME) + 2 * MINS_IN_DAY;
      }
    } else {
      if (mins < BEGIN_TIME) {
        time = BEGIN_TIME - mins;
      } else if (mins >= END_TIME) {
        time = MINS_IN_DAY - (mins - BEGIN_TIME);
      }
    }
    return time * MILLIS_IN_MINUTE;
  }
}

/* CHATGBT suggestion

scheduleBackTest(config: ITestConfig, job: Job) {
    const { startTime, endTime } = config;
    const { MILLIS_IN_MINUTE } = CONSTANTS;
    let currentTime = startTime + this.getTimeUntilNextTradingTime(startTime);
    let adjustment = 0;
    let offset = StockTradeUtil.computeOffset(currentTime);

    while (currentTime <= endTime) {
        while (this.inTradingTime(currentTime, offset)) {
            const minutesSinceStart = (currentTime - startTime) / MILLIS_IN_MINUTE;
            job(minutesSinceStart, currentTime);
            currentTime += MILLIS_IN_MINUTE;
        }
        [adjustment, offset] = this.adjustDaylightSavings(currentTime, adjustment, offset, startTime);
    }
}

private inTradingTime(currentTime: number, offset: number): boolean {
    const date = new Date(currentTime);
    const minutes = StockTradeUtil.getMinutesInDay(date) + offset;
    const isWeekday = date.getDay() % 7 > 0 && date.getDay() % 7 < 6; // Mon to Fri
    const isTradingHours = minutes >= 570 && minutes < 960; // 9:30 AM to 4:00 PM
    return isWeekday && isTradingHours;
}

private adjustDaylightSavings(currentTime: number, adjustment: number, offset: number, startTime: number): [number, number] {
    currentTime += this.getTimeUntilNextTradingTime(currentTime);
    const { MILLIS_IN_DAY, MILLIS_IN_HOUR } = CONSTANTS;
    const elapsed = (currentTime - (startTime + adjustment)) % MILLIS_IN_DAY;

    if (elapsed === MILLIS_IN_HOUR) {
        adjustment += 60 * 60000;
    } else if (elapsed === MILLIS_IN_DAY - MILLIS_IN_HOUR) {
        adjustment -= 60 * 60000;
    }

    offset = StockTradeUtil.computeOffset(currentTime);
    return [adjustment, offset];
}

private getTimeUntilNextTradingTime(currentTime: number): number {
    const date = StockTradeUtil.getEastCoastDate(new Date(currentTime));
    const day = date.getDay();
    const minutes = StockTradeUtil.getMinutesInDay(date);
    const { MINS_IN_DAY, BEGIN_TIME, END_TIME, MILLIS_IN_MINUTE } = CONSTANTS;

    let timeToNextTrade = 0;

    if (day === DAY.SATURDAY || (day === DAY.FRIDAY && minutes >= END_TIME)) {
        timeToNextTrade = MINS_IN_DAY - minutes + BEGIN_TIME + (day === DAY.FRIDAY ? MINS_IN_DAY * 2 : 0);
    } else if (minutes < BEGIN_TIME) {
        timeToNextTrade = BEGIN_TIME - minutes;
    } else if (minutes >= END_TIME) {
        timeToNextTrade = MINS_IN_DAY - minutes + BEGIN_TIME;
    }

    return timeToNextTrade * MILLIS_IN_MINUTE;
}

*/
