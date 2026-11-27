import { configuredNotifiers } from "../notify/notifiers";
import { marketData } from "../providers/market-data";
import { Deployment, settings } from "../shared/settings";

/** The install's settings, as the settings page shows them. Read only. */
export interface IAppSettings {
  deployment: Deployment;
  marketData: {
    /** schwab, massive or recorded */
    provider: string;
    /** true when the provider needs the Schwab sign-in (GET /api/schwab/status) */
    schwabSignIn: boolean;
  };
  /** Which alert channels have their settings in .env. */
  alerts: { email: boolean; sms: boolean };
  backTests: { workers: number; perUser: number; timeoutMs: number };
}

/**
 * Settings belong to the install, not to a user (REFACTOR.md §6, "Two deployment profiles"), so
 * there is no user id here: every logged-in user sees the same values. That is also why this
 * returns no keys, addresses or phone numbers, only whether each one is set.
 */
export class SettingsService {
  static get(): IAppSettings {
    const current = settings();
    const provider = marketData().name;
    const channels = configuredNotifiers().map((n) => n.channel);
    return {
      deployment: current.deployment,
      marketData: { provider, schwabSignIn: provider === "schwab" },
      // the channels the alert outbox will actually send on (a setting it rejects counts as not set up)
      alerts: { email: channels.includes("email"), sms: channels.includes("sms") },
      backTests: {
        workers: current.backTestWorkers,
        perUser: current.backTestsPerUser,
        timeoutMs: current.backTestTimeoutMs,
      },
    };
  }
}
