import { AlertOutbox, BATCH_SIZE, DIGEST_MAX, MAX_ATTEMPTS, POLL_MS, backoffMs, digest } from "../../notify/alert-outbox";
import { configuredNotifiers } from "../../notify/notifiers";
import { Notifier, SEND_TIMEOUT_MS } from "../../notify/notifier";
import AlertRepository, { IAlertRow } from "../../shared/services/repos/alert-repository";

jest.mock("../../notify/notifiers");
jest.mock("../../shared/services/repos/alert-repository");

const repo = AlertRepository as jest.Mocked<typeof AlertRepository>;
const NOW = Date.UTC(2026, 10, 23, 15, 0);

const row = (id: number, over: Partial<IAlertRow> = {}): IAlertRow => ({
  id,
  user_id: 1,
  run_id: 2,
  kind: "entry",
  channel: "email",
  dedup_key: null,
  subject: `subject ${id}`,
  body: `body ${id}`,
  status: "pending",
  attempts: 0,
  next_attempt_at: NOW,
  last_error: null,
  created_at: NOW,
  sent_at: null,
  ...over,
});

describe("AlertOutbox", () => {
  let email: jest.Mocked<Notifier>;
  let sms: jest.Mocked<Notifier>;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    email = { channel: "email", send: jest.fn().mockResolvedValue(undefined) };
    sms = { channel: "sms", send: jest.fn().mockResolvedValue(undefined) };
    (configuredNotifiers as jest.Mock).mockReturnValue([email, sms]);
    repo.enqueue.mockResolvedValue(undefined);
    repo.due.mockResolvedValue([]);
    // the delivery tests below send each row on its own; digests have their own tests
    process.env.ALERT_DIGEST_MS = "0";
    repo.lastSignalSent.mockResolvedValue(null);
    repo.postpone.mockResolvedValue(1);
    repo.claim.mockResolvedValue(true);
    repo.markSent.mockResolvedValue(1);
    repo.markError.mockResolvedValue(1);
    repo.markFailed.mockResolvedValue(1);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    delete process.env.ALERT_DIGEST_MS;
    await AlertOutbox.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("enqueue", () => {
    const alert = { kind: "entry" as const, subject: "s", body: "b", runId: 2, dedupKey: "k" };

    it("stores the alert once for each configured channel", async () => {
      await AlertOutbox.enqueue(alert);
      expect(repo.enqueue).toHaveBeenCalledWith(alert, ["email", "sms"], NOW);
    });

    it("stores nothing when no channel is configured", async () => {
      (configuredNotifiers as jest.Mock).mockReturnValue([]);
      await AlertOutbox.enqueue(alert);
      expect(repo.enqueue).not.toHaveBeenCalled();
    });

    it("never rejects; a database error is logged", async () => {
      repo.enqueue.mockRejectedValue(new Error("db down"));
      await expect(AlertOutbox.enqueue(alert)).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"s"'), expect.any(Error));
    });

    it("wakes a started sender, so the alert goes out without waiting for the poll", async () => {
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(0);
      repo.due.mockResolvedValueOnce([row(1)]);
      await AlertOutbox.enqueue(alert);
      await jest.advanceTimersByTimeAsync(0);
      expect(email.send).toHaveBeenCalledWith(row(1));
    });
  });

  describe("drain", () => {
    it("claims each due row, sends it on its channel and marks it sent", async () => {
      repo.due.mockResolvedValueOnce([row(1), row(2, { channel: "sms", attempts: 2 })]);
      await AlertOutbox.drain();
      expect(email.send).toHaveBeenCalledWith(row(1));
      expect(sms.send).toHaveBeenCalledWith(row(2, { channel: "sms", attempts: 2 }));
      expect(repo.claim.mock.calls).toEqual([
        [1, 1, NOW + backoffMs(1)],
        [2, 3, NOW + backoffMs(3)],
      ]);
      expect(repo.markSent.mock.calls).toEqual([
        [1, NOW],
        [2, NOW],
      ]);
    });

    it("doesn't send a row it couldn't claim", async () => {
      repo.claim.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("lock wait"));
      repo.due.mockResolvedValueOnce([row(1), row(2)]);
      await AlertOutbox.drain();
      expect(email.send).not.toHaveBeenCalled();
    });

    it("a failed status write after a send doesn't make it resend every poll", async () => {
      repo.markSent.mockRejectedValue(new Error("read-only"));
      repo.due.mockResolvedValueOnce([row(1), row(2)]);
      await expect(AlertOutbox.drain()).resolves.toBeUndefined();
      // both were sent once, and both were claimed with a backoff before sending
      expect(email.send).toHaveBeenCalledTimes(2);
      expect(repo.claim).toHaveBeenCalledWith(1, 1, NOW + backoffMs(1));
      expect(repo.claim).toHaveBeenCalledWith(2, 1, NOW + backoffMs(1));
    });

    it("records a failure's message only, leaving the backoff the claim set", async () => {
      const err = Object.assign(new Error("Request failed with status code 500"), {
        config: { auth: { password: "secret-key" } },
      });
      email.send.mockRejectedValue(err);
      repo.due.mockResolvedValueOnce([row(1, { attempts: 2 })]);
      await AlertOutbox.drain();
      expect(repo.claim).toHaveBeenCalledWith(1, 3, NOW + backoffMs(3));
      expect(repo.markError).toHaveBeenCalledWith(1, "Request failed with status code 500");
      expect(repo.markSent).not.toHaveBeenCalled();
    });

    it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
      email.send.mockRejectedValue(new Error("bounced"));
      repo.due.mockResolvedValueOnce([row(1, { attempts: MAX_ATTEMPTS - 1 })]);
      await AlertOutbox.drain();
      expect(repo.markFailed).toHaveBeenCalledWith(1, "bounced");
      expect(repo.markError).not.toHaveBeenCalled();
    });

    it("counts a send that hangs as failed after the timeout", async () => {
      email.send.mockReturnValue(new Promise(() => undefined));
      repo.due.mockResolvedValueOnce([row(1)]);
      const done = AlertOutbox.drain();
      await jest.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      await done;
      expect(repo.markError).toHaveBeenCalledWith(1, expect.stringContaining("timed out"));
    });

    it("a row whose channel is no longer configured fails its attempt", async () => {
      (configuredNotifiers as jest.Mock).mockReturnValue([email]);
      repo.due.mockResolvedValueOnce([row(1, { channel: "sms" })]);
      await AlertOutbox.drain();
      expect(repo.markError).toHaveBeenCalledWith(1, "the sms channel isn't configured any more");
    });

    it("one row's failure doesn't stop the rest", async () => {
      email.send.mockRejectedValueOnce(new Error("first fails"));
      repo.due.mockResolvedValueOnce([row(1), row(2)]);
      await AlertOutbox.drain();
      expect(repo.markError).toHaveBeenCalledWith(1, "first fails");
      expect(repo.markSent).toHaveBeenCalledWith(2, NOW);
    });

    it("a slow channel doesn't hold up the other", async () => {
      sms.send.mockReturnValue(new Promise(() => undefined));
      repo.due.mockResolvedValueOnce([row(1, { channel: "sms" }), row(2)]);
      const done = AlertOutbox.drain();
      await jest.advanceTimersByTimeAsync(0);
      expect(repo.markSent).toHaveBeenCalledWith(2, NOW);
      await jest.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      await done;
    });

    it("after a full batch, asks for the next one straight away", async () => {
      const full = Array.from({ length: BATCH_SIZE }, (_, i) => row(i + 1));
      repo.due.mockResolvedValueOnce(full).mockResolvedValueOnce([row(99)]).mockResolvedValue([]);
      await AlertOutbox.drain();
      expect(repo.due).toHaveBeenCalledTimes(2);
      expect(repo.markSent).toHaveBeenCalledTimes(BATCH_SIZE + 1);
    });

    it("called while a pass is running, runs one more pass instead of a second at once", async () => {
      let release: () => void = () => undefined;
      email.send.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
      repo.due.mockResolvedValueOnce([row(1)]).mockResolvedValueOnce([row(2)]).mockResolvedValue([]);
      const first = AlertOutbox.drain();
      await jest.advanceTimersByTimeAsync(0);
      const second = AlertOutbox.drain();
      expect(second).toBe(first);
      release();
      await first;
      expect(repo.markSent.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    });

    it("called after a pass has finished, starts a new one", async () => {
      repo.due.mockResolvedValueOnce([]).mockResolvedValueOnce([row(1)]);
      await AlertOutbox.drain();
      await AlertOutbox.drain();
      expect(repo.due).toHaveBeenCalledTimes(2);
      expect(repo.markSent).toHaveBeenCalledWith(1, NOW);
    });
  });

  describe("digests", () => {
    const DIGEST = 5 * 60_000;
    /** The rows `due` hands over; `dueSignals` returns those matching its user and channel. */
    const dueAre = (rows: IAlertRow[]) => {
      repo.due.mockResolvedValueOnce(rows);
      repo.dueSignals.mockImplementation(async (userId, channel) =>
        rows.filter((r) => r.kind !== "system" && r.user_id === userId && r.channel === channel),
      );
    };
    beforeEach(() => {
      process.env.ALERT_DIGEST_MS = String(DIGEST);
    });

    it("sends a user's first signal alert at once", async () => {
      dueAre([row(1)]);
      await AlertOutbox.drain();
      expect(repo.lastSignalSent).toHaveBeenCalledWith(1, "email");
      expect(email.send).toHaveBeenCalledWith(row(1));
    });

    it("sends several of a user's alerts on a channel as one digest, oldest first", async () => {
      dueAre([row(3), row(2, { kind: "exit" })]);
      await AlertOutbox.drain();
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(email.send).toHaveBeenCalledWith({ subject: "2 strategy alerts", body: "body 2\nbody 3" });
      expect(repo.markSent.mock.calls.map(([id]) => id).sort()).toEqual([2, 3]);
    });

    it("holds alerts until the wait after the last one sent to that user and channel", async () => {
      repo.lastSignalSent.mockResolvedValue(NOW - 60_000);
      dueAre([row(1), row(2)]);
      await AlertOutbox.drain();
      expect(email.send).not.toHaveBeenCalled();
      expect(repo.claim).not.toHaveBeenCalled();
      expect(repo.postpone).toHaveBeenCalledWith([1, 2], NOW - 60_000 + DIGEST);
    });

    it("keeps users and channels apart, and never holds system alerts", async () => {
      repo.lastSignalSent.mockImplementation(async (userId) => (userId === 1 ? NOW - 60_000 : null));
      dueAre([
        row(1),
        row(2, { user_id: 9 }),
        row(3, { channel: "sms" }),
        row(4, { kind: "system", user_id: null }),
      ]);
      await AlertOutbox.drain();
      expect(repo.postpone).toHaveBeenCalledWith([1], expect.any(Number));
      expect(repo.postpone).toHaveBeenCalledWith([3], expect.any(Number));
      expect(email.send).toHaveBeenCalledWith(row(2, { user_id: 9 }));
      expect(email.send).toHaveBeenCalledWith(row(4, { kind: "system", user_id: null }));
      expect(repo.lastSignalSent).not.toHaveBeenCalledWith(null, "email");
    });

    it("a failed digest is retried for each of its alerts", async () => {
      email.send.mockRejectedValue(new Error("500"));
      dueAre([row(1), row(2, { attempts: MAX_ATTEMPTS - 1 })]);
      await AlertOutbox.drain();
      expect(repo.markError).toHaveBeenCalledWith(1, "500");
      expect(repo.markFailed).toHaveBeenCalledWith(2, "500");
    });

    it("a digest sends only the alerts it could claim", async () => {
      repo.claim.mockImplementation(async (id) => id !== 2);
      dueAre([row(1), row(2), row(3)]);
      await AlertOutbox.drain();
      expect(email.send).toHaveBeenCalledWith({ subject: "2 strategy alerts", body: "body 1\nbody 3" });
    });

    it("can't check the wait: tries again next poll without sending", async () => {
      repo.lastSignalSent.mockRejectedValue(new Error("db down"));
      dueAre([row(1)]);
      await AlertOutbox.drain();
      expect(email.send).not.toHaveBeenCalled();
      expect(repo.claim).not.toHaveBeenCalled();
    });

    it("digest orders by id", () => {
      expect(digest([row(5), row(2)]).body).toBe("body 2\nbody 5");
    });

    it("takes every due alert for the user and channel, not just this batch's", async () => {
      repo.due.mockResolvedValueOnce([row(1)]);
      repo.dueSignals.mockResolvedValueOnce([row(1), row(30), row(31)]);
      await AlertOutbox.drain();
      expect(repo.dueSignals).toHaveBeenCalledWith(1, "email", NOW, DIGEST_MAX);
      expect(email.send).toHaveBeenCalledWith({ subject: "3 strategy alerts", body: "body 1\nbody 30\nbody 31" });
    });

    it("keeps a text digest within the channel's limit, saying how many more", async () => {
      // two 24-character lines, a newline and "\n…and 3 more" make exactly 61
      Object.assign(sms, { maxBodyLength: 61 });
      const rows = [1, 2, 3, 4, 5].map((id) => row(id, { channel: "sms", body: `alert number ${id} body text` }));
      dueAre(rows);
      await AlertOutbox.drain();
      const sent = (sms.send as jest.Mock).mock.calls[0][0];
      expect(sent.body.length).toBeLessThanOrEqual(61);
      expect(sent.body).toBe("alert number 1 body text\nalert number 2 body text\n…and 3 more");
      // all five were covered by the message, so all are marked sent
      expect(repo.markSent).toHaveBeenCalledTimes(5);
    });

    it("a full batch that gets nowhere waits for the next poll instead of looping", async () => {
      repo.lastSignalSent.mockRejectedValue(new Error("lock wait timeout"));
      repo.due.mockResolvedValue(Array.from({ length: BATCH_SIZE }, (_, i) => row(i + 1)));
      await AlertOutbox.drain();
      expect(repo.due).toHaveBeenCalledTimes(1);
    });
  });

  describe("start and stop", () => {
    it("sends due rows at start and then every poll", async () => {
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(repo.due).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(POLL_MS);
      expect(repo.due).toHaveBeenCalledTimes(2);
    });

    it("a database error is logged and the next poll tries again", async () => {
      repo.due.mockRejectedValueOnce(new Error("db down"));
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(POLL_MS);
      expect(console.error).toHaveBeenCalledWith("[AlertOutbox] sending failed", expect.any(Error));
      expect(repo.due).toHaveBeenCalledTimes(2);
    });

    it("stop ends a backlog after the rows being sent, and doesn't reject", async () => {
      const full = Array.from({ length: BATCH_SIZE }, (_, i) => row(i + 1));
      repo.due.mockResolvedValue(full);
      let release: () => void = () => undefined;
      email.send.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(0);
      const stopped = AlertOutbox.stop();
      release();
      await stopped;
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(repo.due).toHaveBeenCalledTimes(1);
    });

    it("starting twice runs one poll loop", async () => {
      AlertOutbox.start();
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(POLL_MS);
      expect(repo.due).toHaveBeenCalledTimes(2);
    });

    it("stop ends the polling", async () => {
      AlertOutbox.start();
      await jest.advanceTimersByTimeAsync(0);
      await AlertOutbox.stop();
      await jest.advanceTimersByTimeAsync(5 * POLL_MS);
      expect(repo.due).toHaveBeenCalledTimes(1);
    });
  });

  it("backs off 30 s, doubling, up to 30 minutes", () => {
    expect([1, 2, 3, 6, 7, 20].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 960_000, 1_800_000, 1_800_000]);
  });
});
