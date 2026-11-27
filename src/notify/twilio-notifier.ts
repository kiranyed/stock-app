import { Twilio } from "twilio";
import { CLIENT_TIMEOUT_MS, IAlertContent, Notifier } from "./notifier";

/** Twilio refuses longer messages. */
const SMS_MAX = 1600;

/** SMS through Twilio. Configured by TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER and NOTIFY_SMS_TO. */
export class TwilioNotifier implements Notifier {
  readonly channel = "sms" as const;
  readonly maxBodyLength = SMS_MAX;

  private constructor(
    private readonly client: Twilio,
    private readonly from: string,
    private readonly to: string,
  ) {}

  /** The notifier the environment configures, or null if any setting is missing. */
  static fromEnv(env = process.env): TwilioNotifier | null {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NOTIFY_SMS_TO } = env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !NOTIFY_SMS_TO) return null;
    return new TwilioNotifier(new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, { timeout: CLIENT_TIMEOUT_MS }), TWILIO_FROM_NUMBER, NOTIFY_SMS_TO);
  }

  /** A text has no subject line; every alert's body stands on its own. A long one is cut short rather than refused. */
  async send({ body }: IAlertContent): Promise<void> {
    const text = body.length > SMS_MAX ? `${body.slice(0, SMS_MAX - 1)}…` : body;
    await this.client.messages.create({ body: text, from: this.from, to: this.to });
  }
}
