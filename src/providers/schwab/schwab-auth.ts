import axios, { AxiosError } from "axios";
import mysql from "mysql2";
import * as dotenv from "dotenv";
import { DatabaseAPI } from "../../shared/services/db-api";
import { MILLIS_IN_DAY } from "../../shared/constants";
import BaseError from "../../errors/base-error";
import Error400 from "../../errors/error-400";
import { AlertOutbox } from "../../notify/alert-outbox";

dotenv.config();

const AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";

/** Schwab refresh tokens die 7 days after sign-in, however often they're used. */
export const REFRESH_TOKEN_LIFETIME_MS = 7 * MILLIS_IN_DAY;
/** Refresh the access token when less than this is left on it. */
const ACCESS_MARGIN_MS = 60 * 1000;
/** Warn (at most once a day) when the refresh token has less than this left. */
const EXPIRY_WARNING_MS = 2 * MILLIS_IN_DAY;

const REFRESH_KEY = "schwab_refresh_token";
const ISSUED_KEY = "schwab_refresh_issued_at";

export const SIGN_IN_HELP =
  "Run `npm run schwab-login`, or POST the redirected URL to /api/schwab/sign-in.";

/** 503: the app is up but cannot reach Schwab until someone signs in. */
export class SchwabSignInRequiredError extends BaseError {
  constructor(reason: string) {
    super(`Schwab sign-in required: ${reason}. ${SIGN_IN_HELP}`, 503, true);
    this.name = "SchwabSignInRequiredError";
  }
}

export interface ISchwabAuthStatus {
  signedIn: boolean;
  /** null when the refresh token came from .env and its sign-in time is unknown */
  refreshExpiresAt: number | null;
  accessExpiresAt: number | null;
}

interface ITokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface IRefreshToken {
  token: string;
  issuedAt: number | null;
}

const config = () => {
  const env = process.env;
  const appKey = env.SCHWAB_APP_KEY || env.CLIENT_ID;
  const secret = env.SCHWAB_SECRET || env.APP_SECRET;
  const redirectUri = env.SCHWAB_REDIRECT_URI || env.REDIRECT_URI;
  if (!appKey || !secret || !redirectUri) {
    throw new Error(
      "Schwab app settings missing: set SCHWAB_APP_KEY, SCHWAB_SECRET and SCHWAB_REDIRECT_URI",
    );
  }
  return { appKey, secret, redirectUri };
};

/**
 * Owns the Schwab OAuth tokens: sign-in by authorization code, refresh-token
 * storage in the `properties` table, and an in-memory access token that is
 * refreshed on demand. One install signs in to one Schwab account.
 */
/** Where a worker thread gets access tokens: the main thread. */
export interface ITokenSource {
  get(): Promise<string>;
  refresh(): Promise<string>;
}

export class SchwabAuth {
  private static access: { token: string; expiresAt: number } | null = null;
  /** undefined until loaded from the DB; token "" means signed out */
  private static refresh: IRefreshToken | undefined = undefined;
  private static inflight: Promise<string> | null = null;
  private static lastWarning = 0;
  private static delegate: ITokenSource | null = null;

  /** In a worker thread: get tokens from the main thread, which owns the sign-in. */
  static delegateTo(source: ITokenSource | null) {
    this.delegate = source;
  }

  static authorizeUrl(): string {
    const { appKey, redirectUri } = config();
    const query = new URLSearchParams({ client_id: appKey, redirect_uri: redirectUri });
    return `${AUTHORIZE_URL}?${query.toString()}`;
  }

  /** The authorization code from a pasted redirect URL, or a bare code. */
  static parseCode(input: string): string {
    const text = input.trim();
    if (!text) throw new Error400("Paste the URL Schwab redirected you to");
    if (/^https?:\/\//i.test(text)) {
      const code = URL.canParse(text) ? new URL(text).searchParams.get("code") : null;
      if (!code) throw new Error400("That URL has no `code` parameter");
      return code;
    }
    return text.includes("%") ? decodeURIComponent(text) : text;
  }

  /** Exchanges an authorization code for tokens and stores the refresh token. */
  static async completeSignIn(input: string): Promise<ISchwabAuthStatus> {
    const code = this.parseCode(input);
    const { redirectUri } = config();
    const data = await this.postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (!data.refresh_token) throw new Error("Schwab returned no refresh token");
    const now = Date.now();
    this.refresh = { token: data.refresh_token, issuedAt: now };
    this.access = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
    this.lastWarning = 0;
    await this.saveRefresh(this.refresh);
    return this.status();
  }

  /** Logs the sign-in state at startup (refreshing the access token if it can); never throws. */
  static async initialize() {
    try {
      await this.getAccessToken();
      const { refreshExpiresAt } = await this.status();
      console.log(
        refreshExpiresAt
          ? `Schwab signed in until ${new Date(refreshExpiresAt).toLocaleString()}`
          : "Schwab signed in (sign-in date unknown until the next sign-in)",
      );
    } catch (err) {
      if (err instanceof SchwabSignInRequiredError) console.warn(err.message);
      else console.error(`Schwab check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** A valid access token, refreshed if it's missing or about to expire. */
  static async getAccessToken(): Promise<string> {
    if (this.delegate) return this.delegate.get();
    if (this.access && this.access.expiresAt - Date.now() > ACCESS_MARGIN_MS) {
      return this.access.token;
    }
    return this.forceRefresh();
  }

  /** Gets a new access token; concurrent callers share one request. */
  static forceRefresh(): Promise<string> {
    if (this.delegate) return this.delegate.refresh();
    if (!this.inflight) {
      this.inflight = this.refreshAccess().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  static async status(): Promise<ISchwabAuthStatus> {
    const refresh = await this.loadRefresh();
    const signedIn = !!refresh.token;
    return {
      signedIn,
      refreshExpiresAt:
        signedIn && refresh.issuedAt !== null ? refresh.issuedAt + REFRESH_TOKEN_LIFETIME_MS : null,
      accessExpiresAt: signedIn && this.access ? this.access.expiresAt : null,
    };
  }

  /** Forget in-memory state (tests). */
  static reset() {
    this.access = null;
    this.refresh = undefined;
    this.inflight = null;
    this.lastWarning = 0;
  }

  private static async refreshAccess(): Promise<string> {
    const current = await this.loadRefresh();
    try {
      return await this.refreshWith(current);
    } catch (err) {
      if (!this.isRejected(err)) throw err;
    }
    // Signed out or rejected. Another process (the CLI) may have signed in
    // since we loaded the token, so look again before giving up.
    this.refresh = undefined;
    const stored = await this.loadRefresh();
    if (stored.token && stored.token !== current.token) {
      try {
        return await this.refreshWith(stored);
      } catch (err) {
        if (!this.isRejected(err)) throw err;
      }
    }
    this.access = null;
    if (!stored.token) throw new SchwabSignInRequiredError("not signed in");
    this.refresh = { token: "", issuedAt: null };
    await this.saveRefresh(this.refresh);
    void AlertOutbox.enqueue({
      kind: "system",
      subject: "Schwab sign-in needed",
      body: `Schwab rejected the refresh token (they last 7 days), so market data has stopped. ${SIGN_IN_HELP}`,
    });
    throw new SchwabSignInRequiredError("Schwab rejected the refresh token (they last 7 days)");
  }

  private static async refreshWith(refresh: IRefreshToken): Promise<string> {
    if (!refresh.token) throw new SchwabSignInRequiredError("not signed in");
    const data = await this.postToken({
      grant_type: "refresh_token",
      refresh_token: refresh.token,
    });
    this.access = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    if (data.refresh_token && data.refresh_token !== refresh.token) {
      this.refresh = { token: data.refresh_token, issuedAt: refresh.issuedAt };
      await this.saveRefresh(this.refresh);
    }
    this.warnIfExpiring(refresh);
    return data.access_token;
  }

  private static warnIfExpiring(refresh: IRefreshToken) {
    if (refresh.issuedAt === null) return;
    const now = Date.now();
    const left = refresh.issuedAt + REFRESH_TOKEN_LIFETIME_MS - now;
    if (left < EXPIRY_WARNING_MS && now - this.lastWarning > MILLIS_IN_DAY) {
      this.lastWarning = now;
      const hours = Math.max(0, Math.floor(left / (60 * 60 * 1000)));
      const text = `Schwab sign-in expires in ${hours} hours. ${SIGN_IN_HELP}`;
      console.warn(text);
      void AlertOutbox.enqueue({ kind: "system", subject: "Schwab sign-in expires soon", body: text, dedupKey: `schwab-expiring:${refresh.issuedAt}` });
    }
  }

  /** 400/401 from the token endpoint: the grant itself was refused. */
  private static isRejected(err: unknown): boolean {
    if (err instanceof SchwabSignInRequiredError) return true;
    const status = (err as AxiosError)?.response?.status;
    return status === 400 || status === 401;
  }

  private static async postToken(form: Record<string, string>): Promise<ITokenResponse> {
    const { appKey, secret } = config();
    const basic = Buffer.from(`${appKey}:${secret}`).toString("base64");
    const res = await axios.post<ITokenResponse>(TOKEN_URL, new URLSearchParams(form).toString(), {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });
    return res.data;
  }

  private static async loadRefresh(): Promise<IRefreshToken> {
    if (this.refresh) return this.refresh;
    const rows = await DatabaseAPI.runQuery<{ name: string; value: string | null }>(
      mysql.format("SELECT name, value FROM properties WHERE name IN (?, ?)", [REFRESH_KEY, ISSUED_KEY]),
    );
    const byName = new Map(rows.map((r) => [r.name, r.value]));
    if (byName.has(REFRESH_KEY)) {
      const issued = Number(byName.get(ISSUED_KEY));
      this.refresh = {
        token: byName.get(REFRESH_KEY) ?? "",
        issuedAt: Number.isFinite(issued) && issued > 0 ? issued : null,
      };
    } else {
      // First run after the switch: carry over the token server's refresh token
      const seeded = process.env.SCHWAB_REFRESH_TOKEN || process.env.REFRESH_TOKEN || "";
      this.refresh = { token: seeded, issuedAt: null };
      await this.saveRefresh(this.refresh);
    }
    return this.refresh;
  }

  private static async saveRefresh(refresh: IRefreshToken) {
    await DatabaseAPI.runQuery(
      mysql.format(
        "INSERT INTO properties (name, value) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
        [REFRESH_KEY, refresh.token, ISSUED_KEY, refresh.issuedAt === null ? "" : String(refresh.issuedAt)],
      ),
    );
  }
}
