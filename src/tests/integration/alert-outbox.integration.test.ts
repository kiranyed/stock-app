import * as dotenv from "dotenv";
import { DatabaseAPI } from "../../shared/services/db-api";
import AlertRepository, { IAlertRow } from "../../shared/services/repos/alert-repository";
import RunRepository from "../../shared/services/repos/run-repository";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import UserRepository from "../../shared/services/repos/user-repository";

// The alert_outbox queries against real MySQL (db/alert-outbox.sql), inside a rolled-back transaction.
describe("Integration - alert outbox", () => {
  let owner = -1;
  let run = -1;
  // far in the future, so the test's rows sort after any others and are due only at T
  const T = 9_000_000_000_000;
  // larger than any real backlog, so the test's rows (which sort last) aren't cut off
  const ALL = 1_000_000;

  const rows = (where: string, params: unknown[]) =>
    DatabaseAPI.query<IAlertRow>(`select * from alert_outbox where ${where} order by id`, params);

  beforeAll(async () => {
    dotenv.config();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
    const stamp = Date.now();
    ({ insertId: owner } = await UserRepository.createUser(`alertowner${stamp}`, "x"));
    const { insertId: strategy } = await StrategyRepository.createStrategy(
      [{ name: "alert it", description: "", period: 1440, screeners: [] }],
      owner,
    );
    const group = await StockGroupRepository.createGroup("alert it", ["AAPL"], owner);
    [{ id: run }] = await RunRepository.createRuns([strategy], group, "simulation");
  }, 60000);

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });

  it("stores a row per channel, with the run's owner as the user", async () => {
    await AlertRepository.enqueue(
      { kind: "entry", runId: run, subject: "s".repeat(300), body: "body", dedupKey: `it:${T}:a` },
      ["email", "sms"],
      T,
    );
    const stored = await rows("dedup_key = ?", [`it:${T}:a`]);
    expect(stored.map((r) => r.channel)).toEqual(["email", "sms"]);
    expect(stored[0]).toMatchObject({
      user_id: owner,
      run_id: run,
      kind: "entry",
      subject: "s".repeat(255),
      status: "pending",
      attempts: 0,
      next_attempt_at: T,
      created_at: T,
      sent_at: null,
    });
  });

  it("skips a duplicate key on the same channel, and stores a system alert without a user", async () => {
    await AlertRepository.enqueue({ kind: "entry", runId: run, subject: "again", body: "b", dedupKey: `it:${T}:a` }, ["email"], T);
    expect(await rows("dedup_key = ?", [`it:${T}:a`])).toHaveLength(2);

    await AlertRepository.enqueue({ kind: "system", subject: "sys", body: "b", dedupKey: `it:${T}:sys` }, ["email"], T);
    const [sys] = await rows("dedup_key = ?", [`it:${T}:sys`]);
    expect(sys).toMatchObject({ user_id: null, run_id: null, kind: "system" });
  });

  it("lists due pending rows oldest first, and records sends, retries and failures", async () => {
    const due = (await AlertRepository.due(T, ALL)).filter((r) => r.dedup_key?.startsWith(`it:${T}`));
    expect(due.map((r) => r.dedup_key)).toEqual([`it:${T}:a`, `it:${T}:a`, `it:${T}:sys`]);
    const [email, sms, sys] = due;

    expect(await AlertRepository.claim(email.id, 1, T + 30_000)).toBe(true);
    await AlertRepository.markSent(email.id, T + 1);
    expect(await AlertRepository.claim(email.id, 2, T + 60_000)).toBe(false); // sent: nothing to claim
    expect(await AlertRepository.claim(sms.id, 1, T + 30_000)).toBe(true);
    await AlertRepository.markError(sms.id, "e".repeat(1200));
    await AlertRepository.claim(sys.id, 8, T + 30_000);
    await AlertRepository.markFailed(sys.id, "gave up");

    const [sent, retry, failed] = await rows("id in (?)", [[email.id, sms.id, sys.id]]);
    expect(sent).toMatchObject({ status: "sent", attempts: 1, sent_at: T + 1, last_error: null });
    expect(retry).toMatchObject({ status: "pending", attempts: 1, next_attempt_at: T + 30_000 });
    expect(retry.last_error).toHaveLength(1000);
    expect(failed).toMatchObject({ status: "failed", attempts: 8, last_error: "gave up" });

    const later = (id: number, now: number) => AlertRepository.due(now, ALL).then((r) => r.some((x) => x.id === id));
    expect(await later(sms.id, T + 29_999)).toBe(false);
    expect(await later(sms.id, T + 30_000)).toBe(true);
    expect(await later(email.id, T + 60_000)).toBe(false);
    expect(await later(sys.id, T + 60_000)).toBe(false);
  });

  it("finds when the last entry or exit alert went to a user on a channel, and holds rows for a digest", async () => {
    // the entry email above was sent at T + 1; nothing went by text, and system alerts don't count
    expect(await AlertRepository.lastSignalSent(owner, "email")).toBe(T + 1);
    expect(await AlertRepository.lastSignalSent(owner, "sms")).toBeNull();

    await AlertRepository.enqueue({ kind: "exit", runId: run, subject: "x", body: "b", dedupKey: `it:${T}:x` }, ["sms"], T);
    const [exit] = await rows("dedup_key = ?", [`it:${T}:x`]);
    expect(await AlertRepository.postpone([exit.id], T + 300_000)).toBe(1);
    const [held] = await rows("id = ?", [exit.id]);
    expect(held).toMatchObject({ status: "pending", attempts: 0, next_attempt_at: T + 300_000 });

    // a digest gathers the user's due entry and exit alerts on that channel only: here the text
    // retried above (due at T + 30 s) and, from T + 300 s, the held exit
    const [smsEntry] = await rows("dedup_key = ? and channel = 'sms'", [`it:${T}:a`]);
    const dueIds = async (now: number) => (await AlertRepository.dueSignals(owner, "sms", now, 100)).map((r) => r.id);
    expect(await dueIds(T + 299_999)).toEqual([smsEntry.id]);
    expect(await dueIds(T + 300_000)).toEqual([smsEntry.id, exit.id]);
    expect(await AlertRepository.dueSignals(owner, "email", T + 300_000, 100)).toEqual([]);
  });
});
