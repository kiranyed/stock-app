import axios from "axios";
import { CLIENT_TIMEOUT_MS, IAlertContent, Notifier } from "./notifier";

/**
 * Email through Mailgun. Configured by MAILGUN_API_KEY, MAILGUN_DOMAIN, NOTIFY_EMAIL_FROM and
 * NOTIFY_EMAIL_TO; MAILGUN_API_URL selects the EU region (https://api.eu.mailgun.net).
 */
export class MailgunNotifier implements Notifier {
  readonly channel = "email" as const;

  private constructor(
    private readonly apiKey: string,
    private readonly domain: string,
    private readonly from: string,
    private readonly to: string,
    private readonly apiUrl: string,
  ) {}

  /** The notifier the environment configures, or null if any setting is missing. */
  static fromEnv(env = process.env): MailgunNotifier | null {
    const { MAILGUN_API_KEY, MAILGUN_DOMAIN, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO, MAILGUN_API_URL } = env;
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !NOTIFY_EMAIL_FROM || !NOTIFY_EMAIL_TO) return null;
    return new MailgunNotifier(
      MAILGUN_API_KEY,
      MAILGUN_DOMAIN,
      NOTIFY_EMAIL_FROM,
      NOTIFY_EMAIL_TO,
      (MAILGUN_API_URL || "https://api.mailgun.net").replace(/\/+$/, ""),
    );
  }

  async send({ subject, body }: IAlertContent): Promise<void> {
    const form = new URLSearchParams({ from: this.from, to: this.to, subject, text: body });
    await axios.post(`${this.apiUrl}/v3/${this.domain}/messages`, form.toString(), {
      auth: { username: "api", password: this.apiKey },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: CLIENT_TIMEOUT_MS,
    });
  }
}
