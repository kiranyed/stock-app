import axios from "axios";
import { DatabaseAPI } from "../../shared/services/db-api";
import {
  REFRESH_TOKEN_LIFETIME_MS,
  SchwabAuth,
  SchwabSignInRequiredError,
} from "../../providers/schwab/schwab-auth";
import { localTokenHandler } from "../../routers/schwab-router";
import { Request, Response } from "express";
import { AlertOutbox } from "../../notify/alert-outbox";

jest.mock("axios");
jest.mock("../../shared/services/db-api");
jest.mock("../../notify/alert-outbox");

const post = axios.post as jest.Mock;
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const NOW = Date.UTC(2026, 10, 22, 15, 0, 0);

/** The `properties` table, as name -> value */
let table: Map<string, string>;

const fakeRunQuery = async (sql: string) => {
  if (/^SELECT/i.test(sql)) {
    const names = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return names.filter((n) => table.has(n)).map((name) => ({ name, value: table.get(name) }));
  }
  for (const [, name, value] of sql.matchAll(/\('([^']*)', '([^']*)'\)/g)) table.set(name, value);
  return [];
};

const tokenResponse = (access: string, refresh?: string, expiresIn = 1800) => ({
  data: { access_token: access, refresh_token: refresh, expires_in: expiresIn },
});
const httpError = (status: number) => Object.assign(new Error(`status ${status}`), { response: { status } });
const formOf = (call: unknown[]) => Object.fromEntries(new URLSearchParams(call[1] as string));

beforeEach(() => {
  table = new Map();
  (DatabaseAPI.runQuery as jest.Mock).mockImplementation(fakeRunQuery);
  post.mockReset();
  (AlertOutbox.enqueue as jest.Mock).mockClear();
  SchwabAuth.reset();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  Object.assign(process.env, {
    SCHWAB_APP_KEY: "app-key",
    SCHWAB_SECRET: "app-secret",
    SCHWAB_REDIRECT_URI: "https://127.0.0.1",
  });
  delete process.env.REFRESH_TOKEN;
  delete process.env.SCHWAB_REFRESH_TOKEN;
});

afterEach(() => jest.restoreAllMocks());

const signedIn = (refresh = "refresh-1", issuedAt = NOW) => {
  table.set("schwab_refresh_token", refresh);
  table.set("schwab_refresh_issued_at", String(issuedAt));
};

describe("SchwabAuth.parseCode", () => {
  it("takes the code from a pasted redirect URL and decodes it", () => {
    expect(SchwabAuth.parseCode("https://127.0.0.1/?code=C0.abc%40&session=s-1")).toBe("C0.abc@");
  });

  it("accepts a bare code, encoded or not", () => {
    expect(SchwabAuth.parseCode(" C0.abc%40 ")).toBe("C0.abc@");
    expect(SchwabAuth.parseCode("C0.abc@")).toBe("C0.abc@");
  });

  it("rejects empty input and URLs without a code", () => {
    expect(() => SchwabAuth.parseCode("  ")).toThrow(/Paste/);
    expect(() => SchwabAuth.parseCode("https://127.0.0.1/?error=access_denied")).toThrow(/no `code`/);
  });
});

describe("SchwabAuth sign-in", () => {
  it("builds the authorize URL from the app key and callback", () => {
    const url = new URL(SchwabAuth.authorizeUrl());
    expect(url.origin + url.pathname).toBe("https://api.schwabapi.com/v1/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("app-key");
    expect(url.searchParams.get("redirect_uri")).toBe("https://127.0.0.1");
  });

  it("exchanges the code with Basic auth and stores the refresh token and sign-in time", async () => {
    post.mockResolvedValueOnce(tokenResponse("access-1", "refresh-1"));

    const status = await SchwabAuth.completeSignIn("https://127.0.0.1/?code=C0.abc%40&session=s");

    const [url, , options] = post.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(formOf(post.mock.calls[0])).toEqual({
      grant_type: "authorization_code",
      code: "C0.abc@",
      redirect_uri: "https://127.0.0.1",
    });
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from("app-key:app-secret").toString("base64")}`);
    expect(table.get("schwab_refresh_token")).toBe("refresh-1");
    expect(table.get("schwab_refresh_issued_at")).toBe(String(NOW));
    expect(status).toEqual({
      signedIn: true,
      refreshExpiresAt: NOW + REFRESH_TOKEN_LIFETIME_MS,
      accessExpiresAt: NOW + 1800 * 1000,
    });
    await expect(SchwabAuth.getAccessToken()).resolves.toBe("access-1");
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("SchwabAuth.getAccessToken", () => {
  it("refreshes with the stored refresh token, then reuses the access token", async () => {
    signedIn();
    post.mockResolvedValueOnce(tokenResponse("access-1", "refresh-1"));

    await expect(SchwabAuth.getAccessToken()).resolves.toBe("access-1");
    await expect(SchwabAuth.getAccessToken()).resolves.toBe("access-1");

    expect(post).toHaveBeenCalledTimes(1);
    expect(formOf(post.mock.calls[0])).toEqual({ grant_type: "refresh_token", refresh_token: "refresh-1" });
  });

  it("refreshes when less than a minute is left", async () => {
    signedIn();
    post.mockResolvedValueOnce(tokenResponse("access-1")).mockResolvedValueOnce(tokenResponse("access-2"));
    await SchwabAuth.getAccessToken();

    (Date.now as jest.Mock).mockReturnValue(NOW + 1740 * 1000 - 1);
    await expect(SchwabAuth.getAccessToken()).resolves.toBe("access-1");
    (Date.now as jest.Mock).mockReturnValue(NOW + 1741 * 1000);
    await expect(SchwabAuth.getAccessToken()).resolves.toBe("access-2");
  });

  it("shares one refresh between concurrent callers", async () => {
    signedIn();
    post.mockResolvedValueOnce(tokenResponse("access-1"));

    const tokens = await Promise.all([1, 2, 3].map(() => SchwabAuth.getAccessToken()));

    expect(tokens).toEqual(["access-1", "access-1", "access-1"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("asks for a sign-in when Schwab rejects the refresh token, and stays signed out", async () => {
    signedIn();
    post.mockRejectedValue(httpError(400));

    await expect(SchwabAuth.getAccessToken()).rejects.toBeInstanceOf(SchwabSignInRequiredError);
    expect(table.get("schwab_refresh_token")).toBe("");
    expect(await SchwabAuth.status()).toEqual({ signedIn: false, refreshExpiresAt: null, accessExpiresAt: null });

    post.mockClear();
    await expect(SchwabAuth.getAccessToken()).rejects.toThrow(/not signed in/);
    expect(post).not.toHaveBeenCalled();
    expect(AlertOutbox.enqueue).toHaveBeenCalledTimes(1);
    expect(AlertOutbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system", subject: "Schwab sign-in needed", body: expect.stringContaining("schwab-login") }),
    );
  });

  it("picks up a sign-in made by another process (the CLI)", async () => {
    signedIn("old-refresh");
    post.mockResolvedValueOnce(tokenResponse("access-1"));
    await SchwabAuth.getAccessToken();

    signedIn("new-refresh");
    post.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce(tokenResponse("access-2"));
    await expect(SchwabAuth.forceRefresh()).resolves.toBe("access-2");
    expect(formOf(post.mock.calls[2]).refresh_token).toBe("new-refresh");
  });

  it("passes other failures through without signing out", async () => {
    signedIn();
    const outage = httpError(503);
    post.mockRejectedValueOnce(outage);

    await expect(SchwabAuth.getAccessToken()).rejects.toBe(outage);
    expect(table.get("schwab_refresh_token")).toBe("refresh-1");
  });

  it("warns once a day when the sign-in has less than 2 days left", async () => {
    signedIn("refresh-1", NOW - 6 * 24 * 3600 * 1000);
    post.mockResolvedValue(tokenResponse("access"));

    await SchwabAuth.forceRefresh();
    await SchwabAuth.forceRefresh();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect((console.warn as jest.Mock).mock.calls[0][0]).toMatch(/expires in 24 hours/);
    expect(AlertOutbox.enqueue).toHaveBeenCalledTimes(1);
    expect(AlertOutbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Schwab sign-in expires soon", dedupKey: `schwab-expiring:${NOW - 6 * 24 * 3600 * 1000}` }),
    );
  });

  it("doesn't send an alert for an outage", async () => {
    signedIn();
    post.mockRejectedValueOnce(httpError(503));
    await expect(SchwabAuth.getAccessToken()).rejects.toBeDefined();
    expect(AlertOutbox.enqueue).not.toHaveBeenCalled();
  });
});

describe("seeding from .env", () => {
  it("uses REFRESH_TOKEN from .env only when the database has none", async () => {
    process.env.REFRESH_TOKEN = "env-refresh";
    post.mockResolvedValue(tokenResponse("access-1"));

    await SchwabAuth.getAccessToken();
    expect(formOf(post.mock.calls[0]).refresh_token).toBe("env-refresh");
    expect(table.get("schwab_refresh_token")).toBe("env-refresh");
    expect((await SchwabAuth.status()).refreshExpiresAt).toBeNull();

    SchwabAuth.reset();
    table.set("schwab_refresh_token", "");
    await expect(SchwabAuth.getAccessToken()).rejects.toThrow(/not signed in/);
  });
});

describe("GET /schwab-token", () => {
  const call = async (remoteAddress: string) => {
    const res = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown };
    const response = {
      status: (code: number) => ((res.statusCode = code), response),
      json: (body: unknown) => ((res.body = body), response),
    } as unknown as Response;
    await localTokenHandler({ socket: { remoteAddress } } as unknown as Request, response);
    return res;
  };

  it("hands the access token to local tools in the old /get-token shape", async () => {
    signedIn();
    post.mockResolvedValueOnce(tokenResponse("access-1"));

    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const res = await call(address);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ token: "access-1", accessToken: "access-1", refreshTime: NOW + 1800 * 1000 });
    }
  });

  it("refuses anything that isn't loopback", async () => {
    signedIn();
    const res = await call("192.168.1.20");
    expect(res.statusCode).toBe(403);
    expect(post).not.toHaveBeenCalled();
  });

  it("returns 503 with sign-in instructions when signed out", async () => {
    table.set("schwab_refresh_token", "");
    const res = await call("127.0.0.1");
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).toMatch(/schwab-login/);
  });
});
