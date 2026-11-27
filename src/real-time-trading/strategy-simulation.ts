import { TradeLogger } from "../shared/utilities/trade-logger";
import { StrategyRun } from "../shared/classes/strategy-run";
import { IAction, IEnterAction, IStrategy } from "../types/strategy-types";
import TransactionRepository from "../shared/services/repos/transaction-repository";
import PaperPositionRepository, { IPaperPosition } from "../shared/services/repos/paper-position-repository";
import { IStockData, ILiveStockScreenerJob } from "../types/data-processing-types";
import { AlertOutbox } from "../notify/alert-outbox";
import { entryAlert, exitAlert } from "../notify/signal-alerts";
import { marketData } from "../providers/market-data";
import { CONSTANTS, PeriodType } from "../shared/constants";
import { EASTERN, wallClock } from "../providers/candles";
import { tradingDaysSince } from "../shared/utilities/date-util";
import { upgradeScreeners } from "../services/strategy-schema";

export interface IStrategySimulationOptions {
  /** Send alerts for entries and exits (stored as live_job.notify_on_entry). */
  notifyOnEntry?: boolean;
}

const sessionDate = (t: number) => {
  const { year, month, day } = wallClock(t, EASTERN);
  return `${year}-${month}-${day}`;
};

/** Why a position closed, for its exit alert. */
type CloseReason = "signal" | "session-end" | "missed-close" | "screener-removed";

/**
 * A live signal strategy: it trades on paper, keeps its open positions in `paper_position` so a
 * restart doesn't forget them, records closed trades in `transaction_sim`, and can send alerts.
 */
export class StrategySimulation
  extends StrategyRun
  implements ILiveStockScreenerJob
{
  TRADE_SIZE = 1;
  id: number = 0;
  private readonly options: IStrategySimulationOptions;
  /** This run's position writes, one after another, so a close never overtakes its open. */
  private writes: Promise<unknown> = Promise.resolve();
  /** Restored positions whose screener was removed from the strategy: closed at the next bar. */
  private screenerRemoved = new Set<string>();
  private screenerIds?: string[];
  /** The reason for the close in progress, when it isn't a signal or the session's end. */
  private closing?: CloseReason;

  constructor(strat: IStrategy, options: IStrategySimulationOptions = {}) {
    super(strat);
    this.options = options;
    this.log = this.log.bind(this);
  }

  setId(id: number) {
    this.id = id;
    TradeLogger.initializeStrategyLog(`Run${id}`);
  }

  getId() {
    return this.id;
  }

  /**
   * Screener `index`'s id, stored with a position to find its screener again. Loaded strategies
   * already have ids (StrategyMapper); one built in code without them gets exactly what
   * upgradeScreeners gives a stored one (`s1`, `s2`..., never a duplicate).
   */
  screenerId(index: number): string {
    this.screenerIds ??= upgradeScreeners(this.getStrategy().screeners).map((s) => s.id as string);
    return this.screenerIds[index] ?? `s${index + 1}`;
  }

  /**
   * Takes back the run's open positions after a restart, each with the screener that entered it,
   * found by id (an edited screener keeps its id, so its positions follow the edited exit rules).
   * If that screener was removed from the strategy, the position closes at the next bar.
   */
  restorePositions(rows: IPaperPosition[], now = Date.now()) {
    const period = this.getPeriod();
    const byId = new Map(this.getStrategy().screeners.map((_, i) => [this.screenerId(i), i]));
    for (const row of rows) {
      const index = byId.get(row.screener_key);
      const screener = this.screenerAt(index ?? 0);
      if (!screener) {
        this.log(`dropped the open position in ${row.symbol}: the strategy has no screeners`);
        this.persist(() => PaperPositionRepository.close(this.id, row.symbol));
        continue;
      }
      if (index === undefined) this.screenerRemoved.add(row.symbol);
      this.positions[row.symbol] = {
        price: row.entry_price,
        enterTime: row.entry_time,
        screener,
        long: row.is_long,
        quantity: row.quantity,
        highestGainPercent: 0,
        lowestLossPercent: 0,
        // bars since entry, as the run would have counted them
        timeSinceEntry:
          period >= PeriodType.DAY
            ? tradingDaysSince(row.entry_time, now)
            : Math.max(0, Math.floor((now - row.entry_time) / (period * CONSTANTS.MILLIS_IN_MINUTE))),
      };
      this.buyingPower -= row.quantity * row.entry_price;
    }
    if (rows.length) this.log(`restored open positions: ${rows.map((r) => r.symbol).join(", ")}`);
  }

  /**
   * Before the strategy's own logic: an intraday position from an earlier session (the server
   * was down, or the run paused, at that session's close) closes now, and so does a restored
   * position whose screener was removed.
   */
  run(datetime: number, stockData: IStockData[]) {
    const intraday = this.getPeriod() < PeriodType.DAY;
    const today = sessionDate(datetime);
    for (const data of stockData) {
      const position = this.positions[data.symbol];
      if (!position) continue;
      const reason: CloseReason | undefined = this.screenerRemoved.has(data.symbol)
        ? "screener-removed"
        : intraday && sessionDate(position.enterTime) !== today
          ? "missed-close"
          : undefined;
      if (!reason) continue;
      this.log(`closing ${data.symbol}: ${reason}`);
      this.closing = reason;
      try {
        this.closePositions([data], datetime);
      } finally {
        this.closing = undefined;
      }
    }
    super.run(datetime, stockData);
  }

  protected buy(action: IEnterAction) {
    const d = new Date(Date.now());
    this.log("bought " + action.symbol + " at " + d.toString());
    super.buy(action);
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
    this.opened(action);
  }

  protected sellShort(action: IEnterAction) {
    const d = new Date(Date.now());
    super.sellShort(action);
    this.log("sold short " + action.symbol + " at " + d.toString());
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
    this.opened(action);
  }

  protected sell(action: IAction) {
    const d = new Date(Date.now());
    this.log("sold " + action.symbol + " at " + d.toString());
    const price = action.price;
    const position = this.positions[action.symbol];
    const gain = action.price / position.price;
    const quantity = position.quantity;
    const profit = price * quantity - position.quantity * position.price;
    super.sell(action);
    TransactionRepository.recordTransactionSim(
      action.symbol,
      d.getTime(),
      profit,
      (gain - 1) * 100,
      true,
      this.id,
    );
    this.buyingPower += quantity * price;
    this.closed(action, true, (gain - 1) * 100);
  }

  protected buyToCover(action: IAction) {
    const price = action.price;
    const prevPrice = this.positions[action.symbol].price;
    const position = this.positions[action.symbol];
    const gain = (prevPrice + (prevPrice - price)) / prevPrice;
    const quantity = position.quantity;
    const profit = quantity * position.price - price * quantity;
    super.buyToCover(action);
    const d = new Date(Date.now());
    this.log("bought to cover " + action.symbol + " at " + d.toString());
    TransactionRepository.recordTransactionSim(
      action.symbol,
      d.getTime(),
      profit,
      (gain - 1) * 100,
      false,
      this.id,
    );
    this.buyingPower += quantity * price;
    this.closed(action, false, (gain - 1) * 100);
  }

  log(text: string) {
    TradeLogger.logToStrategy(text, `Run${this.getId()}`);
  }

  private opened(action: IEnterAction) {
    const position = this.positions[action.symbol];
    this.persist(() =>
      PaperPositionRepository.open({
        run_id: this.id,
        symbol: action.symbol,
        is_long: position.long,
        entry_price: position.price,
        entry_time: position.enterTime,
        quantity: position.quantity,
        screener_key: this.screenerId(this.screenerIndex(position.screener)),
      }),
    );
    this.notify(() =>
      entryAlert({ ...this.signal(action), long: position.long }),
    );
  }

  private closed(action: IAction, long: boolean, gainPercent: number) {
    this.screenerRemoved.delete(action.symbol);
    this.persist(() => PaperPositionRepository.close(this.id, action.symbol));
    const reason: CloseReason = this.closing ?? (action.atClose ? "session-end" : "signal");
    this.notify(() => exitAlert({ ...this.signal(action), long, gainPercent, reason }));
  }

  private signal(action: IAction) {
    return {
      runId: this.id,
      strategyName: this.getStrategyName(),
      symbol: action.symbol,
      price: action.price,
      time: action.time,
      showPrices: marketData().capabilities.displayPrices,
    };
  }

  /** Queues a position write after this run's earlier ones. Never rejects: a failure is logged. */
  private persist(write: () => Promise<unknown>) {
    if (!this.id) return; // not a stored run
    this.writes = this.writes.then(write).catch((err) => {
      console.error(`[StrategySimulation] run ${this.id}: couldn't save a position change`, err);
    });
  }

  /** Resolves once this run's position writes so far have finished (for tests and shutdown). */
  flushWrites() {
    return this.writes;
  }

  /** Queues an alert (sent by the alert outbox) if the run has alerts on. Never throws or rejects. */
  private notify(build: () => Parameters<typeof AlertOutbox.enqueue>[0]) {
    if (!this.options.notifyOnEntry) return;
    try {
      void AlertOutbox.enqueue(build());
    } catch (error) {
      this.log(`Failed to queue an alert: ${String(error)}`);
    }
  }
}
