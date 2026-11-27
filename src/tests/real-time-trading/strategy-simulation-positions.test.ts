import { StrategySimulation } from "../../real-time-trading/strategy-simulation";
import PaperPositionRepository, { IPaperPosition } from "../../shared/services/repos/paper-position-repository";
import { PeriodType } from "../../shared/constants";
import { IStockData } from "../../types/data-processing-types";
import { strategy } from "../golden/golden-harness";
import { EASTERN, zonedTime } from "../../providers/candles";
import { AlertOutbox } from "../../notify/alert-outbox";
import { IStrategySimulationOptions } from "../../real-time-trading/strategy-simulation";

jest.mock("../../shared/utilities/trade-logger");
jest.mock("../../shared/services/repos/transaction-repository");
jest.mock("../../shared/services/repos/paper-position-repository");
jest.mock("../../providers/market-data", () => ({
  marketData: () => ({ capabilities: { displayPrices: true } }),
}));
jest.mock("../../notify/alert-outbox");

const repo = PaperPositionRepository as jest.Mocked<typeof PaperPositionRepository>;
const always = [{ varName: "price", operator: ">", compareVal: "0" }];
const never = [{ varName: "price", operator: "<", compareVal: "0" }];
/** `hhmm` Eastern on `date`. */
const et = (date: string, hhmm: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return zonedTime({ year, month, day, hour, minute }, EASTERN);
};
const quote = (symbol: string, price: number, t: number): IStockData => ({ symbol, price, datetime: t, volume: 1 });
/** Calls a protected trading method. */
const call = (sim: StrategySimulation, method: "buy" | "sellShort" | "sell" | "buyToCover", action: object) =>
  (sim as unknown as Record<string, (a: object) => void>)[method](action);
const positionsOf = (sim: StrategySimulation) =>
  (sim as unknown as { positions: Record<string, { price: number; long: boolean; timeSinceEntry: number }> }).positions;
const make = (period = PeriodType.FIVE_MINUTES, enter = always, exit = never, options: IStrategySimulationOptions = {}) => {
  const sim = new StrategySimulation(strategy(period, enter, exit), options);
  sim.setId(42);
  return sim;
};

describe("StrategySimulation paper positions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.open.mockResolvedValue(1);
    repo.close.mockResolvedValue(1);
  });

  it("stores a position when it opens and deletes it when it closes", async () => {
    const sim = make();
    const t = et("2026-11-23", "10:00");
    const screener = (sim as unknown as { screenerAt(i: number): unknown }).screenerAt(0);
    call(sim, "buy", { symbol: "AAPL", price: 150, orderType: "BUY", time: t, screener });
    call(sim, "sellShort", { symbol: "TSLA", price: 200, orderType: "SELL_SHORT", time: t, screener });
    call(sim, "sell", { symbol: "AAPL", price: 160, orderType: "SELL", time: t + 300_000 });
    await sim.flushWrites();

    expect(repo.open.mock.calls.map(([p]) => p)).toEqual([
      { run_id: 42, symbol: "AAPL", is_long: true, entry_price: 150, entry_time: t, quantity: 10, screener_key: sim.screenerId(0) },
      { run_id: 42, symbol: "TSLA", is_long: false, entry_price: 200, entry_time: t, quantity: 7, screener_key: sim.screenerId(0) },
    ]);
    expect(repo.close).toHaveBeenCalledWith(42, "AAPL");
  });

  it("writes in order, so a close never overtakes its open", async () => {
    const order: string[] = [];
    let finishOpen: () => void = () => undefined;
    repo.open.mockImplementation(() => new Promise((r) => (finishOpen = () => (order.push("open"), r(1)))));
    repo.close.mockImplementation(async () => (order.push("close"), 1));
    const sim = make();
    const t = et("2026-11-23", "10:00");
    call(sim, "buy", { symbol: "AAPL", price: 150, orderType: "BUY", time: t, screener: undefined });
    call(sim, "sell", { symbol: "AAPL", price: 160, orderType: "SELL", time: t + 300_000 });
    await Promise.resolve();
    expect(repo.close).not.toHaveBeenCalled();
    finishOpen();
    await sim.flushWrites();
    expect(order).toEqual(["open", "close"]);
  });

  it("a failed write is logged and later writes still happen", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    repo.open.mockRejectedValueOnce(new Error("db down"));
    const sim = make();
    const t = et("2026-11-23", "10:00");
    call(sim, "buy", { symbol: "AAPL", price: 150, orderType: "BUY", time: t, screener: undefined });
    call(sim, "sell", { symbol: "AAPL", price: 160, orderType: "SELL", time: t + 300_000 });
    await sim.flushWrites();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("run 42: couldn't save a position change"), expect.any(Error));
    expect(repo.close).toHaveBeenCalledWith(42, "AAPL");
    error.mockRestore();
  });

  it("a run without an id (not stored) writes nothing", async () => {
    const sim = new StrategySimulation(strategy(PeriodType.FIVE_MINUTES, always));
    call(sim, "buy", { symbol: "AAPL", price: 150, orderType: "BUY", time: 1, screener: undefined });
    await sim.flushWrites();
    expect(repo.open).not.toHaveBeenCalled();
  });

  describe("alerts", () => {
    const t = et("2026-11-23", "10:00");
    const enqueued = () => (AlertOutbox.enqueue as jest.Mock).mock.calls.map(([a]) => a);

    it("with alerts on, sends one for each entry and exit, with the gain", () => {
      const sim = make(PeriodType.FIVE_MINUTES, always, never, { notifyOnEntry: true });
      call(sim, "sellShort", { symbol: "TSLA", price: 200, orderType: "SELL_SHORT", time: t, screener: undefined });
      call(sim, "buyToCover", { symbol: "TSLA", price: 180, orderType: "BUY_TO_COVER", time: t + 300_000 });
      expect(enqueued()).toEqual([
        expect.objectContaining({ kind: "entry", runId: 42, subject: "golden-1: entered short TSLA" }),
        expect.objectContaining({
          kind: "exit",
          runId: 42,
          subject: "golden-1: exited short TSLA (+10.00%)",
          body: expect.stringContaining("exit signal"),
        }),
      ]);
    });

    it("says when a position closed at the end of the session", () => {
      const sim = make(PeriodType.FIVE_MINUTES, always, never, { notifyOnEntry: true });
      call(sim, "buy", { symbol: "AAPL", price: 100, orderType: "BUY", time: t, screener: undefined });
      sim.closePositions([quote("AAPL", 99, t + 300_000)], t + 300_000);
      expect(enqueued()[1]).toMatchObject({ kind: "exit", subject: "golden-1: exited long AAPL (-1.00%)" });
      expect(enqueued()[1].body).toContain("closed at the end of the session");
    });

    it("with alerts off, sends none", () => {
      const sim = make();
      call(sim, "buy", { symbol: "AAPL", price: 100, orderType: "BUY", time: t, screener: undefined });
      call(sim, "sell", { symbol: "AAPL", price: 101, orderType: "SELL", time: t + 300_000 });
      expect(AlertOutbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("restorePositions", () => {
    /** A stored position, entered by `sim`'s first screener unless `fields` says otherwise. */
    const row = (sim: StrategySimulation, fields: Partial<IPaperPosition> = {}): IPaperPosition => ({
      run_id: 42,
      symbol: "AAPL",
      is_long: true,
      entry_price: 100,
      entry_time: et("2026-11-23", "10:00"),
      quantity: 15,
      screener_key: sim.screenerId(0),
      ...fields,
    });
    const exitReasons = () =>
      (AlertOutbox.enqueue as jest.Mock).mock.calls.map(([a]) => a).filter((a) => a.kind === "exit").map((a) => a.body);

    it("takes back positions, with buying power and bars since entry", () => {
      const sim = make(PeriodType.FIVE_MINUTES);
      sim.restorePositions([row(sim), row(sim, { symbol: "TSLA", is_long: false, entry_price: 200, quantity: 7 })], et("2026-11-23", "10:27"));
      const positions = positionsOf(sim);
      expect(positions.AAPL).toMatchObject({ price: 100, long: true, timeSinceEntry: 5 });
      expect(positions.TSLA).toMatchObject({ price: 200, long: false });
      // 15000 - 1500 - 1400: room for 8 more 1500 trades
      expect((sim as unknown as { buyingPower: number }).buyingPower).toBe(12100);
    });

    it("counts trading days for a DAY strategy", () => {
      const sim = make(PeriodType.DAY);
      // entered Friday's close; by Tuesday noon only Monday's daily bar has closed
      sim.restorePositions([row(sim, { entry_time: et("2026-11-20", "15:59") })], et("2026-11-24", "12:00"));
      expect(positionsOf(sim).AAPL.timeSinceEntry).toBe(1);
    });

    it("then exits on the strategy's own signals, deleting the stored position", async () => {
      const sim = make(PeriodType.FIVE_MINUTES, always, always);
      sim.restorePositions([row(sim)], et("2026-11-23", "10:27"));
      sim.setVars({ price: { AAPL: 110 } });
      sim.run(et("2026-11-23", "10:30"), [quote("AAPL", 110, et("2026-11-23", "10:30"))]);
      await sim.flushWrites();
      expect(positionsOf(sim).AAPL).toBeUndefined();
      expect(repo.close).toHaveBeenCalledWith(42, "AAPL");
    });

    it.each([
      ["restarted on a later day", et("2026-11-20", "14:00"), et("2026-11-23", "09:31")],
      // the review's case: the dates match, but the session's close went by while the app was down
      ["restarted after the close, the same day", et("2026-11-23", "14:00"), et("2026-11-23", "17:00")],
    ])("closes at the next session's first bar an intraday position that missed its close (%s)", async (_n, entry, restart) => {
      const sim = make(PeriodType.FIVE_MINUTES, never, never, { notifyOnEntry: true });
      sim.restorePositions([row(sim, { entry_time: entry })], restart);
      sim.run(et("2026-11-24", "09:35"), [quote("AAPL", 90, et("2026-11-24", "09:35"))]);
      await sim.flushWrites();
      expect(positionsOf(sim).AAPL).toBeUndefined();
      expect(repo.close).toHaveBeenCalledWith(42, "AAPL");
      expect(exitReasons()).toEqual([expect.stringContaining("the app was down or paused at the end of the session")]);
    });

    it("closes an intraday position the run held while paused over the close", async () => {
      const sim = make(PeriodType.FIVE_MINUTES, always, never);
      call(sim, "buy", { symbol: "AAPL", price: 100, orderType: "BUY", time: et("2026-11-23", "14:00"), screener: undefined });
      // paused: no bars until the next morning
      sim.run(et("2026-11-24", "09:35"), [quote("AAPL", 101, et("2026-11-24", "09:35"))]);
      await sim.flushWrites();
      expect(repo.close).toHaveBeenCalledWith(42, "AAPL");
    });

    it("keeps a DAY position across sessions", () => {
      const sim = make(PeriodType.DAY, never, never);
      sim.restorePositions([row(sim, { entry_time: et("2026-11-20", "15:59") })], et("2026-11-23", "10:00"));
      sim.run(et("2026-11-23", "15:59"), [quote("AAPL", 90, et("2026-11-23", "15:59"))]);
      expect(positionsOf(sim).AAPL).toBeDefined();
    });

    it("finds a position's screener by id, not its place in the list, and follows its edited rules", () => {
      const withIds = (period: PeriodType, ...screeners: [string, object[], object[]][]) => {
        const sim = new StrategySimulation({
          ...strategy(period, always, never),
          screeners: screeners.map(([id, enter, exit]) => ({ ...strategy(period, enter, exit).screeners[0], id })),
        });
        sim.setId(42);
        return sim;
      };
      const before = withIds(PeriodType.DAY, ["keep", always, never]);
      const stored = row(before, { entry_time: et("2026-11-20", "15:59") });
      expect(stored.screener_key).toBe("keep");
      // later: a new screener in front, and the position's screener edited to exit on any price
      const after = withIds(PeriodType.DAY, ["new", never, never], ["keep", always, always]);
      after.restorePositions([stored], et("2026-11-23", "10:00"));
      const screenerAt = (after as unknown as { screenerAt(i: number): unknown }).screenerAt.bind(after);
      expect((positionsOf(after).AAPL as unknown as { screener: unknown }).screener).toBe(screenerAt(1));
      after.setVars({ price: { AAPL: 90 } });
      after.run(et("2026-11-23", "15:59"), [quote("AAPL", 90, et("2026-11-23", "15:59"))]);
      expect(positionsOf(after).AAPL).toBeUndefined();
    });

    it("uses s1, s2... for a strategy built without ids, as stored strategies are upgraded", () => {
      const sim = make();
      expect(sim.screenerId(0)).toBe("s1");
    });

    it("closes at the next bar a position whose screener was removed", async () => {
      const sim = make(PeriodType.DAY, never, never, { notifyOnEntry: true });
      sim.restorePositions([row(sim, { screener_key: "gone", entry_time: et("2026-11-20", "15:59") })], et("2026-11-23", "10:00"));
      expect(positionsOf(sim).AAPL).toBeDefined();
      sim.run(et("2026-11-23", "15:59"), [quote("AAPL", 90, et("2026-11-23", "15:59"))]);
      await sim.flushWrites();
      expect(positionsOf(sim).AAPL).toBeUndefined();
      expect(exitReasons()).toEqual([expect.stringContaining("screener that entered it was removed")]);
    });
  });

  it("enters a symbol once per bar when two signals hit it, holding the last, and pays for it once", () => {
    const sim = new StrategySimulation({
      ...strategy(PeriodType.FIVE_MINUTES, always, never),
      screeners: [strategy(PeriodType.FIVE_MINUTES, always, never).screeners[0], strategy(PeriodType.FIVE_MINUTES, always, never).screeners[0]],
    }, { notifyOnEntry: true });
    sim.setId(42);
    sim.setVars({ price: { AAPL: 100 } });
    sim.run(et("2026-11-23", "10:00"), [quote("AAPL", 100, et("2026-11-23", "10:00"))]);
    expect((sim as unknown as { buyingPower: number }).buyingPower).toBe(13500);
    expect((AlertOutbox.enqueue as jest.Mock).mock.calls.filter(([a]) => a.kind === "entry")).toHaveLength(1);
  });
});
