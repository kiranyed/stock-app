import AlertRepository, { INewAlert, IAlertRow } from "../shared/services/repos/alert-repository";
import { configuredNotifiers } from "./notifiers";
import { IAlertContent, Notifier, SEND_TIMEOUT_MS, withTimeout } from "./notifier";
import { settings } from "../shared/settings";

const MINUTE = 60_000;
/** How often the sender looks for due rows; a new alert is sent at once without waiting for this. */
export const POLL_MS = 5_000;
/** Rows handled per pass. A full batch is followed straight away by another. */
export const BATCH_SIZE = 20;
/** The most alerts one digest takes. */
export const DIGEST_MAX = 500;
/** A row that has failed this many times is marked failed and not tried again. */
export const MAX_ATTEMPTS = 8;

/** The wait after the `attempts`-th failure: 30 s, doubling, at most 30 minutes (about 1.5 h for all 8). */
export const backoffMs = (attempts: number) => Math.min(30_000 * 2 ** (attempts - 1), 30 * MINUTE);

/**
 * Alerts go through the `alert_outbox` table instead of being sent from the code that raises
 * them (PRODUCTION-READINESS.md §2.4). `enqueue` stores a row per configured channel; the sender
 * sends due rows with a timeout and retries failures with backoff. Rows survive a restart.
 *
 * Delivery is at least once: if the process stops between sending and marking a row sent, it's
 * sent again after the restart. Only one process may run the sender.
 */
export class AlertOutbox {
  private static started = false;
  private static timer?: NodeJS.Timeout;
  private static sending?: Promise<void>;
  private static again = false;
  /** Set by stop(): the pass in progress ends after the row it's sending. A new pass clears it. */
  private static stopping = false;

  /**
   * Stores `alert` for every configured channel and wakes the sender. Never rejects: callers
   * (strategies, the scheduler, the Schwab sign-in) don't wait for it, and a failure is logged.
   */
  static async enqueue(alert: INewAlert): Promise<void> {
    try {
      const channels = configuredNotifiers().map((n) => n.channel);
      if (!channels.length) return;
      await AlertRepository.enqueue(alert, channels, Date.now());
      if (this.started) this.wake();
    } catch (err) {
      console.error(`[AlertOutbox] couldn't store the alert "${alert.subject}"`, err);
    }
  }

  /** Start sending: due rows now, then every {@link POLL_MS}. */
  static start() {
    if (this.started) return;
    this.started = true;
    this.wake();
    this.poll();
  }

  /** Stop sending. Resolves once the row being sent (if any) is done; never rejects. */
  static async stop() {
    this.started = false;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.sending?.catch(() => undefined);
  }

  /**
   * Send every due row. If a pass is already running, it runs once more when done, so a row
   * stored meanwhile isn't left for the next poll. Rejects if the database can't be read.
   */
  static drain(): Promise<void> {
    if (this.sending) {
      this.again = true;
      return this.sending;
    }
    this.stopping = false;
    this.sending = (async () => {
      try {
        do {
          this.again = false;
          const full = await this.sendDue();
          if (full) this.again = true;
        } while (this.again && !this.stopping);
      } finally {
        // here, not in a .finally(): a drain() arriving after the last check must start a new pass
        this.sending = undefined;
      }
    })();
    return this.sending;
  }

  private static wake() {
    this.drain().catch((err) => console.error("[AlertOutbox] sending failed", err));
  }

  private static poll() {
    this.timer = setTimeout(() => {
      if (!this.started) return;
      this.wake();
      this.poll();
    }, POLL_MS);
    this.timer.unref?.();
  }

  /**
   * One batch. A system alert is sent on its own. A user's entry and exit alerts on one channel
   * go together, as one digest when there are several (see `sendUnit`). Channels are sent side
   * by side, so a slow one doesn't hold up the other. Returns whether to go straight on to
   * another batch: only when this one was full and got somewhere. A batch that made no progress
   * (the database is failing) waits for the next poll instead of looping.
   */
  private static async sendDue(): Promise<boolean> {
    const rows = await AlertRepository.due(Date.now(), BATCH_SIZE);
    if (!rows.length) return false;
    const digestMs = settings().alertDigestMs;
    const notifiers = new Map(configuredNotifiers().map((n) => [n.channel, n]));
    const units: IAlertRow[][] = [];
    const signalGroups = new Map<string, IAlertRow[]>();
    for (const row of rows) {
      if (row.kind === "system" || !digestMs) {
        units.push([row]);
        continue;
      }
      const key = `${row.user_id}:${row.channel}`;
      let group = signalGroups.get(key);
      if (!group) {
        group = [];
        signalGroups.set(key, group);
        units.push(group);
      }
      group.push(row);
    }
    const byChannel = new Map<string, IAlertRow[][]>();
    for (const unit of units) byChannel.set(unit[0].channel, [...(byChannel.get(unit[0].channel) ?? []), unit]);
    let progressed = false;
    await Promise.all(
      [...byChannel.values()].map(async (channelUnits) => {
        for (const unit of channelUnits) {
          if (this.stopping) return;
          if (await this.sendUnit(unit, notifiers.get(unit[0].channel), digestMs)) progressed = true;
        }
      }),
    );
    return rows.length === BATCH_SIZE && progressed;
  }

  /**
   * Sends one alert, or several of a user's entry and exit alerts as one digest.
   * - Throttling: if an entry or exit alert went to this user on this channel less than
   *   `digestMs` ago, the rows wait until then (and gather with any that arrive meanwhile).
   * - A digest takes every due entry and exit alert for the user and channel (up to
   *   {@link DIGEST_MAX}), not just those in this batch, so a burst goes out in one message.
   * - Each row is claimed (its attempt counted, its due time moved on) before sending, so if the
   *   result can't be written afterwards it's retried with backoff, at most
   *   {@link MAX_ATTEMPTS} times, rather than every poll.
   * Never rejects: database errors are logged. Returns whether it got anywhere (sent or tried
   * a row, or put rows off).
   */
  private static async sendUnit(batchRows: IAlertRow[], notifier: Notifier | undefined, digestMs: number): Promise<boolean> {
    const { channel, user_id: userId, kind } = batchRows[0];
    let rows = batchRows;
    if (kind !== "system" && digestMs) {
      try {
        const last = await AlertRepository.lastSignalSent(userId, channel);
        if (last !== null && Date.now() - last < digestMs) {
          await AlertRepository.postpone(rows.map((r) => r.id), last + digestMs);
          return true;
        }
        rows = await AlertRepository.dueSignals(userId, channel, Date.now(), DIGEST_MAX);
        if (!rows.length) return false;
      } catch (err) {
        console.error(`[AlertOutbox] couldn't check the ${channel} digest wait for user ${userId}; trying next poll`, err);
        return false;
      }
    }

    const claimed: { row: IAlertRow; attempts: number }[] = [];
    for (const row of rows) {
      const attempts = row.attempts + 1;
      try {
        if (await AlertRepository.claim(row.id, attempts, Date.now() + backoffMs(attempts))) claimed.push({ row, attempts });
      } catch (err) {
        console.error(`[AlertOutbox] couldn't claim alert ${row.id} (${channel}); not sending it now`, err);
      }
    }
    if (!claimed.length) return false;

    const ids = claimed.map((c) => c.row.id);
    const label = ids.length === 1 ? `alert ${ids[0]} (${channel})` : `digest of alerts ${ids.join(", ")} (${channel})`;
    let error: string | undefined;
    try {
      if (!notifier) throw new Error(`the ${channel} channel isn't configured any more`);
      const content = claimed.length === 1 ? claimed[0].row : digest(claimed.map((c) => c.row), notifier.maxBodyLength);
      await withTimeout(notifier.send(content), SEND_TIMEOUT_MS, `sending ${label}`);
    } catch (err) {
      // the message only: an axios error's config holds the API key
      error = err instanceof Error ? err.message : String(err);
    }
    for (const { row, attempts } of claimed) {
      try {
        if (error === undefined) {
          await AlertRepository.markSent(row.id, Date.now());
        } else if (attempts >= MAX_ATTEMPTS) {
          console.error(`[AlertOutbox] gave up on alert ${row.id} (${channel}) after ${attempts} attempts: ${error}`);
          await AlertRepository.markFailed(row.id, error);
        } else {
          console.warn(`[AlertOutbox] ${label} failed, attempt ${attempts}: ${error}`);
          await AlertRepository.markError(row.id, error);
        }
      } catch (err) {
        console.error(`[AlertOutbox] couldn't record the result for alert ${row.id} (${channel}); it's retried after its backoff`, err);
      }
    }
    return true;
  }
}

/**
 * Several entry and exit alerts as one message, oldest first, one line each. If they don't fit
 * in `maxLength` characters, as many as fit are listed and a last line says how many more.
 */
export const digest = (rows: IAlertRow[], maxLength = Infinity): IAlertContent => {
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  const lines: string[] = [];
  let length = 0;
  for (const [i, row] of ordered.entries()) {
    const rest = ordered.length - i - 1;
    // room for this line, and for the "more" line if any are left after it
    const needed = length + (lines.length ? 1 : 0) + row.body.length + (rest ? `\n…and ${rest} more`.length : 0);
    if (needed > maxLength) break;
    lines.push(row.body);
    length += (lines.length > 1 ? 1 : 0) + row.body.length;
  }
  const left = ordered.length - lines.length;
  if (left) lines.push(`…and ${left} more`);
  return { subject: `${ordered.length} strategy alerts`, body: lines.join("\n") };
};
