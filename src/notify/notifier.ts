/** Where an alert can go. Each install configures its own channels (see `configuredNotifiers`). */
export type AlertChannel = "email" | "sms";

export interface IAlertContent {
  /** The email subject. */
  subject: string;
  /** The whole message: a text message sends only this, so it must make sense without the subject. */
  body: string;
}

/** Sends one alert on one channel to the install's configured recipient. Rejects if it wasn't sent. */
export interface Notifier {
  readonly channel: AlertChannel;
  /** The longest body the channel takes (texts); digests are kept within it. */
  readonly maxBodyLength?: number;
  send(alert: IAlertContent): Promise<void>;
}

/**
 * Each provider's own request timeout. It's shorter than {@link SEND_TIMEOUT_MS}, so a request
 * is abandoned by its client (and can't still succeed) before the attempt counts as failed.
 */
export const CLIENT_TIMEOUT_MS = 10_000;
/** A send that takes longer than this counts as failed and is retried later; a backstop for the client timeouts. */
export const SEND_TIMEOUT_MS = 15_000;

/** Rejects if `promise` hasn't settled within `ms`. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
