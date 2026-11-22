import { CONSTANTS } from "../shared/constants";
import { SchwabAPI } from "../shared/services/trading-api";
import { PositionRiskMonitor } from "./position-risk-monitor";
import { TradeLogger } from "../shared/utilities/trade-logger";

/**
 * Position Risk Monitor Job
 *
 * Standalone service that runs independently from trading strategies.
 * Monitors position rules and executes automatic exits during market hours.
 */
export class PositionMonitorJob {
  private static monitorInterval: NodeJS.Timeout | undefined;
  private static startTimeout: NodeJS.Timeout | undefined;
  private static isRunning = false;

  /**
   * Start the position monitor job during market hours
   */
  static async start(): Promise<void> {
    if (this.isRunning) {
      TradeLogger.debug("[PositionMonitorJob] Monitor already running");
      return;
    }

    TradeLogger.debug("[PositionMonitorJob] Starting position monitor job");

    try {
      // Check if market is open
      const marketOpen = await SchwabAPI.isMarketOpen();
      if (!marketOpen) {
        TradeLogger.debug("[PositionMonitorJob] Market closed, will wait to start");
        this.scheduleStartAfterMarketOpen();
        return;
      }

      this.isRunning = true;

      // Run monitor every 1-2 minutes during market hours
      this.monitorInterval = setInterval(async () => {
        try {
          const ecm = this.getEastCoastMinutes();
          const { END_TIME } = CONSTANTS;

          // Stop at end of trading hours
          if (ecm >= END_TIME) {
            TradeLogger.debug("[PositionMonitorJob] End of trading day, stopping monitor");
            this.stopMonitoringUntilNextSession();
            return;
          }

          TradeLogger.debug(
            `[PositionMonitorJob] Running monitor cycle at eastCoastMinute=${ecm}`,
          );
          await PositionRiskMonitor.startMonitoring();
        } catch (err) {
          TradeLogger.debug(`[PositionMonitorJob] Error in monitor cycle: ${String(err)}`);
        }
      }, CONSTANTS.MILLIS_IN_MINUTE); // Run every minute

      TradeLogger.debug("[PositionMonitorJob] Monitor interval started");

      // Run immediately for first check
      try {
        const marketStillOpen = await SchwabAPI.isMarketOpen();
        if (!marketStillOpen) {
          TradeLogger.debug(
            "[PositionMonitorJob] Skipping initial monitor run because market is closed",
          );
        } else {
          await PositionRiskMonitor.startMonitoring();
        }
      } catch (err) {
        TradeLogger.debug(
          `[PositionMonitorJob] Error in initial monitor run: ${String(err)}`,
        );
      }
    } catch (err) {
      TradeLogger.debug(`[PositionMonitorJob] Failed to start monitor: ${String(err)}`);
      this.isRunning = false;
    }
  }

  /**
   * Stop the position monitor job
   */
  static stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = undefined;
    }
    this.isRunning = false;
    TradeLogger.debug("[PositionMonitorJob] Position monitor stopped");
  }

  /**
   * Stop the active monitor loop and arm the next trading-session start.
   */
  private static stopMonitoringUntilNextSession(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    this.isRunning = false;
    this.scheduleStartAfterMarketOpen();
    TradeLogger.debug("[PositionMonitorJob] Position monitor paused until next session");
  }

  /**
   * Schedule a startup check after market opens
   */
  private static scheduleStartAfterMarketOpen(): void {
    if (this.isRunning || this.startTimeout) {
      return;
    }

    const delay = this.getMillisUntilNextMarketCheck();
    TradeLogger.debug(
      `[PositionMonitorJob] Scheduling next market-open check in ${Math.round(delay / 1000)} seconds`,
    );

    this.startTimeout = setTimeout(async () => {
      this.startTimeout = undefined;

      try {
        const marketOpen = await SchwabAPI.isMarketOpen();
        if (marketOpen) {
          TradeLogger.debug("[PositionMonitorJob] Market opened, starting monitor");
          await this.start();
          return;
        }

        TradeLogger.debug("[PositionMonitorJob] Market still closed, rescheduling start");
        this.scheduleStartAfterMarketOpen();
      } catch (err) {
        TradeLogger.debug(
          `[PositionMonitorJob] Error checking market status: ${String(err)}`,
        );
        this.scheduleStartAfterMarketOpen();
      }
    }, delay);
  }

  /**
   * Get current minutes in the trading day (East Coast time)
   */
  private static getEastCoastMinutes(): number {
    const estTime = this.getEastCoastDate();

    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();

    // Convert to minutes since midnight
    return hours * 60 + minutes;
  }

  private static getMillisUntilNextMarketCheck(): number {
    const estTime = this.getEastCoastDate();
    const day = estTime.getDay();
    const minutes = this.getEastCoastMinutes();
    const { BEGIN_TIME, END_TIME, MINS_IN_DAY, MILLIS_IN_MINUTE } = CONSTANTS;

    if (day >= 1 && day <= 5 && minutes >= BEGIN_TIME && minutes < END_TIME) {
      return 30000;
    }

    let minutesUntilNextOpen = 0;

    if (day === 0) {
      minutesUntilNextOpen = MINS_IN_DAY + (BEGIN_TIME - minutes);
    } else if (day === 6) {
      minutesUntilNextOpen = 2 * MINS_IN_DAY + (BEGIN_TIME - minutes);
    } else if (minutes < BEGIN_TIME) {
      minutesUntilNextOpen = BEGIN_TIME - minutes;
    } else if (minutes >= END_TIME) {
      if (day === 5) {
        minutesUntilNextOpen = 3 * MINS_IN_DAY + (BEGIN_TIME - minutes);
      } else {
        minutesUntilNextOpen = MINS_IN_DAY - minutes + BEGIN_TIME;
      }
    }

    return Math.max(minutesUntilNextOpen, 1) * MILLIS_IN_MINUTE;
  }

  private static getEastCoastDate(date = new Date()): Date {
    return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  }

  /**
   * Check if monitor is currently running
   */
  static isActive(): boolean {
    return this.isRunning;
  }
}
