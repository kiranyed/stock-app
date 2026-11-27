import { AlertChannel } from "../../../notify/notifier";
import { DatabaseAPI } from "../db-api";

export type AlertKind = "entry" | "exit" | "system";
export type AlertStatus = "pending" | "sent" | "failed";

export interface INewAlert {
  kind: AlertKind;
  subject: string;
  body: string;
  /** The run the alert is about. Its strategy's owner becomes the alert's user unless `userId` is given. */
  runId?: number;
  userId?: number;
  /** Alerts with the same key on the same channel are stored once. */
  dedupKey?: string;
}

export interface IAlertRow {
  id: number;
  user_id: number | null;
  run_id: number | null;
  kind: AlertKind;
  channel: AlertChannel;
  dedup_key: string | null;
  subject: string;
  body: string;
  status: AlertStatus;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  sent_at: number | null;
}

const SUBJECT_MAX = 255;
const ERROR_MAX = 1000;
const DEDUP_MAX = 191;

/** `alert_outbox` rows (db/alert-outbox.sql): one per alert per channel. Every value is a placeholder. */
export default class AlertRepository {
  /** Stores `alert` once for each channel, due now. A duplicate `dedupKey` on a channel is skipped. */
  static async enqueue(alert: INewAlert, channels: AlertChannel[], now: number): Promise<void> {
    if (!channels.length) return;
    const owner = "coalesce(?, (select s.user_id from live_job j join strategy s on s.id = j.strategy_id where j.id = ?))";
    const values = channels.map(() => `(${owner}, ?, ?, ?, ?, ?, ?, ?, ?)`).join(", ");
    const params = channels.flatMap((channel) => [
      alert.userId ?? null,
      alert.runId ?? null,
      alert.runId ?? null,
      alert.kind,
      channel,
      alert.dedupKey?.slice(0, DEDUP_MAX) ?? null,
      alert.subject.slice(0, SUBJECT_MAX),
      alert.body,
      now,
      now,
    ]);
    // `on duplicate key` rather than `insert ignore`, which would also hide truncation and other errors
    await DatabaseAPI.insert(
      "insert into alert_outbox (user_id, run_id, kind, channel, dedup_key, subject, body, next_attempt_at, created_at) " +
        `values ${values} on duplicate key update id = id`,
      params,
    );
  }

  /** Pending rows due by `now`, oldest first. */
  static due(now: number, limit: number): Promise<IAlertRow[]> {
    return DatabaseAPI.query<IAlertRow>(
      "select * from alert_outbox where status = 'pending' and next_attempt_at <= ? order by next_attempt_at, id limit ?",
      [now, limit],
    );
  }

  /**
   * Counts an attempt and sets when the next one is due, before sending. Returns false if the
   * row is no longer pending (nothing to send).
   */
  static async claim(id: number, attempts: number, nextAttemptAt: number): Promise<boolean> {
    const changed = await DatabaseAPI.modify(
      "update alert_outbox set attempts = ?, next_attempt_at = ? where id = ? and status = 'pending'",
      [attempts, nextAttemptAt, id],
    );
    return changed > 0;
  }

  static markSent(id: number, now: number) {
    return DatabaseAPI.modify("update alert_outbox set status = 'sent', sent_at = ?, last_error = null where id = ?", [
      now,
      id,
    ]);
  }

  /** Records why the attempt failed; the row stays pending until the time `claim` set. */
  static markError(id: number, error: string) {
    return DatabaseAPI.modify("update alert_outbox set last_error = ? where id = ?", [error.slice(0, ERROR_MAX), id]);
  }

  static markFailed(id: number, error: string) {
    return DatabaseAPI.modify("update alert_outbox set status = 'failed', last_error = ? where id = ?", [
      error.slice(0, ERROR_MAX),
      id,
    ]);
  }

  /** When the last entry or exit alert went to this user (null: system) on this channel, or null if none has. */
  static async lastSignalSent(userId: number | null, channel: AlertChannel): Promise<number | null> {
    const [row] = await DatabaseAPI.query<{ sent: number | null }>(
      "select max(sent_at) as sent from alert_outbox where kind in ('entry', 'exit') and status = 'sent' " +
        "and channel = ? and user_id <=> ?",
      [channel, userId],
    );
    return row?.sent === null || row?.sent === undefined ? null : Number(row.sent);
  }

  /** The user's (null: system) pending entry and exit alerts on this channel due by `now`, oldest first. */
  static dueSignals(userId: number | null, channel: AlertChannel, now: number, limit: number): Promise<IAlertRow[]> {
    return DatabaseAPI.query<IAlertRow>(
      "select * from alert_outbox where status = 'pending' and next_attempt_at <= ? and kind in ('entry', 'exit') " +
        "and channel = ? and user_id <=> ? order by id limit ?",
      [now, channel, userId, limit],
    );
  }

  /** Holds pending rows until `until` (a digest's wait); attempts aren't counted. */
  static postpone(ids: number[], until: number) {
    if (!ids.length) return Promise.resolve(0);
    return DatabaseAPI.modify(
      "update alert_outbox set next_attempt_at = ? where id in (?) and status = 'pending'",
      [until, ids],
    );
  }
}
