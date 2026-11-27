import os from "os";

/**
 * Settings that differ between a self-hosted copy and the hosted site. `DEPLOYMENT` only picks
 * the defaults; each setting can be overridden on its own. Code reads the setting, never the
 * deployment (REFACTOR.md §6, "Two deployment profiles").
 */
export type Deployment = "self-hosted" | "hosted";

export interface ISettings {
  deployment: Deployment;
  /** Worker threads for back tests (`BACKTEST_WORKERS`). 0 runs them on the main thread. */
  backTestWorkers: number;
  /** Back tests one user may have running or waiting at once (`BACKTEST_MAX_PER_USER`). 0 means no limit. */
  backTestsPerUser: number;
  /** A back test running longer than this is stopped (`BACKTEST_TIMEOUT_MS`, at most about 24.8 days). 0 means no limit. */
  backTestTimeoutMs: number;
  /** Back tests that may wait for a free worker, across all users (`BACKTEST_MAX_WAITING`); 503 past it. 0 means no limit. */
  backTestMaxWaiting: number;
  /** A back test still waiting for a worker after this long is dropped with a 503 (`BACKTEST_MAX_WAIT_MS`). 0 means no limit. */
  backTestMaxWaitMs: number;
  /**
   * After an entry or exit alert goes to a user on a channel, later ones wait this long and are
   * sent together as one digest (`ALERT_DIGEST_MS`). 0 sends each at once. System alerts never wait.
   */
  alertDigestMs: number;
}

const MINUTE = 60_000;
/** Node's longest timer; a longer one fires after 1 ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** One core stays free for requests and live runs; more than 4 rarely helps one database. */
const defaultWorkers = () => Math.min(4, Math.max(1, os.availableParallelism() - 1));

const DEFAULTS: Record<Deployment, () => Omit<ISettings, "deployment">> = {
  "self-hosted": () => ({
    backTestWorkers: defaultWorkers(),
    backTestsPerUser: 0,
    backTestTimeoutMs: 10 * MINUTE,
    backTestMaxWaiting: 20,
    backTestMaxWaitMs: 5 * MINUTE,
    alertDigestMs: 5 * MINUTE,
  }),
  hosted: () => ({
    backTestWorkers: defaultWorkers(),
    backTestsPerUser: 2,
    backTestTimeoutMs: 5 * MINUTE,
    backTestMaxWaiting: 50,
    backTestMaxWaitMs: MINUTE,
    // a shared email provider sends for every user
    alertDigestMs: 15 * MINUTE,
  }),
};

const wholeNumber = (name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number, 0 or more; got "${raw}"`);
  }
  if (value > max) throw new Error(`${name} must be at most ${max}; got "${raw}"`);
  return value;
};

/** The current settings, read from the environment each call. Throws on an invalid value. */
export const settings = (): ISettings => {
  const deployment = (process.env.DEPLOYMENT?.trim() || "self-hosted") as Deployment;
  // own keys only: `in` would also accept "constructor", "toString" and the like
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, deployment)) {
    throw new Error(`DEPLOYMENT must be "self-hosted" or "hosted"; got "${deployment}"`);
  }
  const defaults = DEFAULTS[deployment]();
  return {
    deployment,
    backTestWorkers: wholeNumber("BACKTEST_WORKERS", defaults.backTestWorkers),
    backTestsPerUser: wholeNumber("BACKTEST_MAX_PER_USER", defaults.backTestsPerUser),
    backTestTimeoutMs: wholeNumber("BACKTEST_TIMEOUT_MS", defaults.backTestTimeoutMs, MAX_TIMEOUT_MS),
    backTestMaxWaiting: wholeNumber("BACKTEST_MAX_WAITING", defaults.backTestMaxWaiting),
    backTestMaxWaitMs: wholeNumber("BACKTEST_MAX_WAIT_MS", defaults.backTestMaxWaitMs, MAX_TIMEOUT_MS),
    alertDigestMs: wholeNumber("ALERT_DIGEST_MS", defaults.alertDigestMs, MAX_TIMEOUT_MS),
  };
};
