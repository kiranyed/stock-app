import axios from "axios";
import { Twilio } from "twilio";
import dotenv from "dotenv";
dotenv.config();
interface IEntryNotificationPayload {
  orderType: string;
  price: number;
  strategyName: string;
  symbol: string;
  time: number;
}

export class EntryNotificationService {
  private static getSmsConfig() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NOTIFY_SMS_TO } = process.env;
    if (
      !TWILIO_ACCOUNT_SID ||
      !TWILIO_AUTH_TOKEN ||
      !TWILIO_FROM_NUMBER ||
      !NOTIFY_SMS_TO
    ) {
      return null;
    }
    return {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      from: TWILIO_FROM_NUMBER,
      to: NOTIFY_SMS_TO,
    };
  }

  private static getEmailConfig() {
    const { MAILGUN_API_KEY, MAILGUN_DOMAIN, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO } = process.env;
    if (
      !MAILGUN_API_KEY ||
      !MAILGUN_DOMAIN ||
      !NOTIFY_EMAIL_FROM ||
      !NOTIFY_EMAIL_TO
    ) {
      return null;
    }
    return {
      apiKey: MAILGUN_API_KEY,
      domain: MAILGUN_DOMAIN,
      from: NOTIFY_EMAIL_FROM,
      to: NOTIFY_EMAIL_TO,
    };
  }

  private static buildMessage(payload: IEntryNotificationPayload) {
    const action = payload.orderType === "BUY" ? "entered long" : "entered short";
    return `${payload.strategyName}: ${action} ${payload.symbol} at ${payload.price.toFixed(2)} (${new Date(payload.time).toLocaleString()})`;
  }

  private static async sendSms(message: string) {
    const config = this.getSmsConfig();
    if (!config) {
      return;
    }
    const client = new Twilio(config.accountSid, config.authToken);
    await client.messages.create({
      body: message,
      from: config.from,
      to: config.to,
    });
  }

  private static async sendEmail(message: string) {
    const config = this.getEmailConfig();
    if (!config) {
      return;
    }
    const body = new URLSearchParams({
      from: config.from,
      to: config.to,
      subject: "Strategy simulation entry notification",
      text: message,
    });
    await axios.post(
      `https://api.mailgun.net/v3/${config.domain}/messages`,
      body.toString(),
      {
        auth: {
          username: "api",
          password: config.apiKey,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
  }

  static async sendEntryNotification(payload: IEntryNotificationPayload) {
    const message = this.buildMessage(payload);
    await Promise.all([this.sendSms(message), this.sendEmail(message)]);
  }
}