import { settings } from "../../shared/settings";

const NAMES = [
  "DEPLOYMENT",
  "BACKTEST_WORKERS",
  "BACKTEST_MAX_PER_USER",
  "BACKTEST_TIMEOUT_MS",
  "BACKTEST_MAX_WAITING",
  "BACKTEST_MAX_WAIT_MS",
  "ALERT_DIGEST_MS",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("settings", () => {
  it("defaults to self-hosted: no per-user limit, 1 to 4 workers, a 10-minute timeout, 20 waiting for 5 minutes", () => {
    const s = settings();
    expect(s).toMatchObject({
      deployment: "self-hosted",
      backTestsPerUser: 0,
      backTestTimeoutMs: 600000,
      backTestMaxWaiting: 20,
      backTestMaxWaitMs: 300000,
      alertDigestMs: 300000,
    });
    expect(s.backTestWorkers).toBeGreaterThanOrEqual(1);
    expect(s.backTestWorkers).toBeLessThanOrEqual(4);
  });

  it("the hosted profile limits back tests per user", () => {
    process.env.DEPLOYMENT = "hosted";
    expect(settings()).toMatchObject({
      deployment: "hosted",
      backTestsPerUser: 2,
      backTestTimeoutMs: 300000,
      backTestMaxWaiting: 50,
      backTestMaxWaitMs: 60000,
      alertDigestMs: 900000,
    });
  });

  it("each setting can be overridden on its own", () => {
    process.env.DEPLOYMENT = "hosted";
    process.env.BACKTEST_MAX_PER_USER = "0";
    process.env.BACKTEST_WORKERS = "0";
    process.env.BACKTEST_MAX_WAITING = "0";
    process.env.BACKTEST_MAX_WAIT_MS = "1000";
    process.env.ALERT_DIGEST_MS = "0";
    expect(settings()).toMatchObject({
      deployment: "hosted",
      backTestsPerUser: 0,
      backTestWorkers: 0,
      backTestMaxWaiting: 0,
      backTestMaxWaitMs: 1000,
      alertDigestMs: 0,
    });
  });

  it.each([
    ["BACKTEST_WORKERS", "-1"],
    ["BACKTEST_WORKERS", "two"],
    ["BACKTEST_MAX_PER_USER", "1.5"],
    ["BACKTEST_MAX_WAITING", "-3"],
    ["BACKTEST_MAX_WAIT_MS", "soon"],
  ])("rejects %s=%s", (name, value) => {
    process.env[name] = value;
    expect(() => settings()).toThrow(`${name} must be a whole number, 0 or more; got "${value}"`);
  });

  it.each(["cloud", "constructor", "toString", "__proto__"])("rejects the deployment %s", (value) => {
    process.env.DEPLOYMENT = value;
    expect(() => settings()).toThrow(`DEPLOYMENT must be "self-hosted" or "hosted"; got "${value}"`);
  });

  it("rejects a timeout longer than Node's longest timer, which would fire at once", () => {
    process.env.BACKTEST_TIMEOUT_MS = "2147483647";
    expect(settings().backTestTimeoutMs).toBe(2147483647);
    process.env.BACKTEST_TIMEOUT_MS = String(30 * 24 * 3600 * 1000);
    expect(() => settings()).toThrow('BACKTEST_TIMEOUT_MS must be at most 2147483647; got "2592000000"');
    delete process.env.BACKTEST_TIMEOUT_MS;
    process.env.BACKTEST_MAX_WAIT_MS = String(30 * 24 * 3600 * 1000);
    expect(() => settings()).toThrow('BACKTEST_MAX_WAIT_MS must be at most 2147483647; got "2592000000"');
  });
});
