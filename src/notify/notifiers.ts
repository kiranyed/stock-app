import { MailgunNotifier } from "./mailgun-notifier";
import { Notifier } from "./notifier";
import { TwilioNotifier } from "./twilio-notifier";

/**
 * The channels this install has set up, read from the environment. Alerts go to the install's
 * operator: a self-hosted copy has one user (REFACTOR.md §6). Per-user recipients come with the
 * hosted profile (PRODUCTION-READINESS.md §1.3).
 */
export const configuredNotifiers = (env = process.env): Notifier[] => {
  const notifiers: Notifier[] = [];
  // built one at a time: a bad Twilio setting (the client throws on an SID not starting "AC") mustn't stop email
  for (const [name, build] of BUILDERS) {
    try {
      const notifier = build(env);
      if (notifier) notifiers.push(notifier);
    } catch (err) {
      const message = `[AlertOutbox] ${name} alerts are off: ${err instanceof Error ? err.message : String(err)}`;
      if (!reported.has(message)) console.error(message);
      reported.add(message);
    }
  }
  return notifiers;
};

const BUILDERS: [string, (env: NodeJS.ProcessEnv) => Notifier | null][] = [
  ["email", (env) => MailgunNotifier.fromEnv(env)],
  ["text", (env) => TwilioNotifier.fromEnv(env)],
];
/** Settings errors already logged; this is called on every enqueue and send pass. */
const reported = new Set<string>();
