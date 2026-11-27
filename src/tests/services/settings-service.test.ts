import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { resetMarketData } from "../../providers/market-data";
import { getSettings } from "../../routers/settings-router";
import { SettingsService } from "../../services/settings-service";

const ENV_KEYS = [
  "DEPLOYMENT",
  "MARKET_DATA_PROVIDER",
  "CANDLE_SOURCE",
  "BACKTEST_WORKERS",
  "BACKTEST_MAX_PER_USER",
  "BACKTEST_TIMEOUT_MS",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
  "NOTIFY_EMAIL_FROM",
  "NOTIFY_EMAIL_TO",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "NOTIFY_SMS_TO",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetMarketData();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetMarketData();
});

describe("SettingsService.get", () => {
  it("shows the self-hosted defaults with Schwab data and no alert channels", () => {
    process.env.BACKTEST_WORKERS = "2";
    expect(SettingsService.get()).toEqual({
      deployment: "self-hosted",
      marketData: { provider: "schwab", schwabSignIn: true },
      alerts: { email: false, sms: false },
      backTests: { workers: 2, perUser: 0, timeoutMs: 600_000 },
    });
  });

  it("shows the provider in use; Massive needs no Schwab sign-in", () => {
    process.env.MARKET_DATA_PROVIDER = "massive";
    expect(SettingsService.get().marketData).toEqual({ provider: "massive", schwabSignIn: false });
    resetMarketData();
    delete process.env.MARKET_DATA_PROVIDER;
    process.env.CANDLE_SOURCE = "polygon";
    expect(SettingsService.get().marketData.provider).toBe("massive");
  });

  it("says which alert channels are set up, but never their keys or addresses", () => {
    Object.assign(process.env, {
      MAILGUN_API_KEY: "key-secret",
      MAILGUN_DOMAIN: "mg.example.com",
      NOTIFY_EMAIL_FROM: "app@example.com",
      NOTIFY_EMAIL_TO: "me@example.com",
      TWILIO_ACCOUNT_SID: "AC123",
    });
    const result = SettingsService.get();
    expect(result.alerts).toEqual({ email: true, sms: false });
    const text = JSON.stringify(result);
    for (const secret of ["key-secret", "mg.example.com", "me@example.com", "AC123"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows the hosted profile's limits", () => {
    process.env.DEPLOYMENT = "hosted";
    expect(SettingsService.get()).toMatchObject({
      deployment: "hosted",
      backTests: { perUser: 2, timeoutMs: 300_000 },
    });
  });
});

describe("GET /api/settings", () => {
  const call = () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    getSettings({} as Request, res as unknown as Response, next);
    return { res, next };
  };

  it("answers with the settings", () => {
    const { res } = call();
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json.mock.calls[0][0]).toMatchObject({ deployment: "self-hosted" });
  });

  it("passes a bad setting to the error handler", () => {
    process.env.DEPLOYMENT = "cloud";
    const { res, next } = call();
    expect(res.json).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
