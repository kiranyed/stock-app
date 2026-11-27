import axios from "axios";
import { MailgunNotifier } from "../../notify/mailgun-notifier";
import { TwilioNotifier } from "../../notify/twilio-notifier";
import { configuredNotifiers } from "../../notify/notifiers";
import { CLIENT_TIMEOUT_MS } from "../../notify/notifier";

jest.mock("axios");
const create = jest.fn();
jest.mock("twilio", () => ({ Twilio: jest.fn(() => ({ messages: { create } })) }));

const MAILGUN = {
  MAILGUN_API_KEY: "key",
  MAILGUN_DOMAIN: "mg.example.com",
  NOTIFY_EMAIL_FROM: "alerts@example.com",
  NOTIFY_EMAIL_TO: "me@example.com",
};
const TWILIO = {
  TWILIO_ACCOUNT_SID: "AC1",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM_NUMBER: "+15550000000",
  NOTIFY_SMS_TO: "+15551111111",
};

describe("notifiers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("configures only the channels whose settings are all present", () => {
    expect(configuredNotifiers({}).map((n) => n.channel)).toEqual([]);
    expect(configuredNotifiers({ ...MAILGUN, NOTIFY_EMAIL_TO: "" }).map((n) => n.channel)).toEqual([]);
    expect(configuredNotifiers({ ...MAILGUN }).map((n) => n.channel)).toEqual(["email"]);
    expect(configuredNotifiers({ ...MAILGUN, ...TWILIO }).map((n) => n.channel)).toEqual(["email", "sms"]);
  });

  it("Mailgun posts the subject and body, with a timeout", async () => {
    (axios.post as jest.Mock).mockResolvedValue({});
    await MailgunNotifier.fromEnv(MAILGUN)!.send({ subject: "Hello", body: "World" });
    const [url, form, options] = (axios.post as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
    expect(Object.fromEntries(new URLSearchParams(form))).toEqual({
      from: "alerts@example.com",
      to: "me@example.com",
      subject: "Hello",
      text: "World",
    });
    expect(options).toMatchObject({ auth: { username: "api", password: "key" }, timeout: CLIENT_TIMEOUT_MS });
  });

  it("Mailgun can use the EU region", async () => {
    (axios.post as jest.Mock).mockResolvedValue({});
    await MailgunNotifier.fromEnv({ ...MAILGUN, MAILGUN_API_URL: "https://api.eu.mailgun.net" })!.send({ subject: "s", body: "b" });
    expect((axios.post as jest.Mock).mock.calls[0][0]).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });

  it("a bad Twilio setting turns off texts but not email", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { Twilio } = jest.requireMock("twilio");
    Twilio.mockImplementationOnce(() => {
      throw new Error("accountSid must start with AC");
    });
    expect(configuredNotifiers({ ...MAILGUN, ...TWILIO, TWILIO_ACCOUNT_SID: "SK1" }).map((n) => n.channel)).toEqual(["email"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("text alerts are off: accountSid must start with AC"));
    error.mockRestore();
  });

  it("Mailgun ignores a trailing slash on the API URL", async () => {
    (axios.post as jest.Mock).mockResolvedValue({});
    await MailgunNotifier.fromEnv({ ...MAILGUN, MAILGUN_API_URL: "https://api.eu.mailgun.net/" })!.send({ subject: "s", body: "b" });
    expect((axios.post as jest.Mock).mock.calls[0][0]).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });

  it("Twilio shortens a text over 1600 characters", async () => {
    create.mockResolvedValue({});
    await TwilioNotifier.fromEnv(TWILIO)!.send({ subject: "s", body: "x".repeat(2000) });
    expect(create.mock.calls[0][0].body).toHaveLength(1600);
  });

  it("Twilio texts the body only", async () => {
    create.mockResolvedValue({});
    await TwilioNotifier.fromEnv(TWILIO)!.send({ subject: "Hello", body: "World" });
    expect(create).toHaveBeenCalledWith({ body: "World", from: "+15550000000", to: "+15551111111" });
  });
});
