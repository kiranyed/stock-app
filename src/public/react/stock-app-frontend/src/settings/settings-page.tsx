import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { IAppSettings, ISchwabStatus } from "../shared/types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import "./settings-page.scss";

const PROVIDER_NAMES: Record<string, string> = {
  schwab: "Schwab (your own developer app)",
  massive: "Massive (formerly Polygon.io)",
  recorded: "Recorded candles (load tests)",
};

/** The server's `{ message }`, or a fallback. */
const errorMessage = (err: unknown, fallback: string): string => {
  const message = (err as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
};

const formatTime = (time: number) => new Date(time).toLocaleString();

const formatDuration = (ms: number) =>
  ms === 0
    ? "no limit"
    : ms % 60_000 === 0
      ? `${ms / 60_000} minutes`
      : `${(ms / 1000).toFixed(0)} seconds`;

const yesNo = (configured: boolean) =>
  configured ? "Set up" : "Not set up";

function SchwabSignIn() {
  const [status, setStatus] = useState<ISchwabStatus | null>(null);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");
  const [waitingForPaste, setWaitingForPaste] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(() => {
    StockAppAPI.getSchwabStatus()
      .then(setStatus)
      .catch((err) =>
        setError(errorMessage(err, "Couldn't read the Schwab sign-in status")),
      );
  }, []);

  useEffect(loadStatus, [loadStatus]);

  const openLogin = async () => {
    setError("");
    try {
      const { url } = await StockAppAPI.getSchwabAuthorizeUrl();
      window.open(url, "_blank", "noopener");
      setWaitingForPaste(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't get Schwab's login page"));
    }
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      setStatus(await StockAppAPI.schwabSignIn(pasted.trim()));
      setPasted("");
      setWaitingForPaste(false);
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  };

  const expiry = status?.signedIn
    ? status.refreshExpiresAt
      ? `Signed in until ${formatTime(status.refreshExpiresAt)}. Schwab ends every sign-in after 7 days.`
      : "Signed in. The expiry is unknown until the next sign-in."
    : "Not signed in. Market data won't load until you sign in.";

  return (
    <section className="settings-section" aria-label="Schwab sign-in">
      <h3>Schwab sign-in</h3>
      {status ? (
        <p data-testid="schwab-status">{expiry}</p>
      ) : (
        !error && <p>Loading…</p>
      )}
      <Button
        label={status?.signedIn ? "Sign in again" : "Sign in to Schwab"}
        onClick={openLogin}
      />
      {waitingForPaste && (
        <div className="paste-step">
          <p>
            Log in on the Schwab page that opened. Schwab then sends the browser
            to your callback address, which won&apos;t load; that is expected.
            Copy that page&apos;s full address and paste it here within about 30
            seconds.
          </p>
          <label htmlFor="schwab-redirect">Address Schwab sent you to</label>
          <InputText
            id="schwab-redirect"
            value={pasted}
            placeholder="https://127.0.0.1/?code=…"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setPasted(e.target.value)
            }
          />
          <Button
            label="Finish sign-in"
            onClick={submit}
            disabled={!pasted.trim() || busy}
          />
        </div>
      )}
      {error && <Message severity="error" text={error} />}
    </section>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<IAppSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    StockAppAPI.getSettings()
      .then(setSettings)
      .catch((err) => setError(errorMessage(err, "Couldn't load settings")));
  }, []);

  if (error) {
    return (
      <div className="settings-container">
        <h2>Settings</h2>
        <Message severity="error" text={error} />
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="settings-container">
        <h2>Settings</h2>
        <p>Loading…</p>
      </div>
    );
  }

  const { marketData, alerts, backTests, deployment } = settings;
  return (
    <div className="settings-container">
      <h2>Settings</h2>
      <p className="settings-note">
        These come from the server&apos;s <code>.env</code> file. Change them
        there and restart the app.
      </p>

      <section className="settings-section" aria-label="Market data">
        <h3>Market data</h3>
        <dl>
          <dt>Provider</dt>
          <dd data-testid="provider">
            {PROVIDER_NAMES[marketData.provider] ?? marketData.provider}
          </dd>
        </dl>
        <small>
          <code>MARKET_DATA_PROVIDER</code>: <code>schwab</code> or{" "}
          <code>massive</code>
        </small>
      </section>

      {marketData.schwabSignIn && <SchwabSignIn />}

      <section className="settings-section" aria-label="Alerts">
        <h3>Alerts</h3>
        <dl>
          <dt>Email (Mailgun)</dt>
          <dd data-testid="alert-email">{yesNo(alerts.email)}</dd>
          <dt>Text message (Twilio)</dt>
          <dd data-testid="alert-sms">{yesNo(alerts.sms)}</dd>
        </dl>
        <small>
          Email needs <code>MAILGUN_API_KEY</code>, <code>MAILGUN_DOMAIN</code>,{" "}
          <code>NOTIFY_EMAIL_FROM</code> and <code>NOTIFY_EMAIL_TO</code>.
        </small>
      </section>

      <section className="settings-section" aria-label="Back tests">
        <h3>Back tests</h3>
        <dl>
          <dt>Profile</dt>
          <dd>{deployment}</dd>
          <dt>Running at once</dt>
          <dd>
            {backTests.workers === 0
              ? "1 (on the main thread)"
              : backTests.workers}
          </dd>
          <dt>Per user</dt>
          <dd>{backTests.perUser === 0 ? "no limit" : backTests.perUser}</dd>
          <dt>Time limit</dt>
          <dd>{formatDuration(backTests.timeoutMs)}</dd>
        </dl>
      </section>
    </div>
  );
}
