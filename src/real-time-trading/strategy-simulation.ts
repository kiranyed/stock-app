import { TradeLogger } from "../shared/utilities/trade-logger";
import { StrategyRun } from "../shared/classes/strategy-run";
import { IAction, IEnterAction, IStrategy } from "../types/strategy-types";
import TransactionRepository from "../shared/services/repos/transaction-repository";
import { ILiveStockScreenerJob } from "../types/data-processing-types";
import { EntryNotificationService } from "../shared/services/entry-notification-service";

export interface IStrategySimulationOptions {
  notifyOnEntry?: boolean;
}

export class StrategySimulation
  extends StrategyRun
  implements ILiveStockScreenerJob
{
  TRADE_SIZE = 1;
  runId = 0;
  id: number = 0;
  private readonly options: IStrategySimulationOptions;

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

  protected buy(action: IEnterAction) {
    const d = new Date(Date.now());
    this.log("bought " + action.symbol + " at " + d.toString());
    super.buy(action);
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
    void this.notifyEntry(action);
  }

  protected sellShort(action: IEnterAction) {
    const d = new Date(Date.now());
    super.sellShort(action);
    this.log("sold short " + action.symbol + " at " + d.toString());
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
    void this.notifyEntry(action);
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
      this.runId,
    );
    this.buyingPower += quantity * price;
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
    /* STRATEGY ID ADD !! */
    TransactionRepository.recordTransactionSim(
      action.symbol,
      d.getTime(),
      profit,
      (gain - 1) * 100,
      false,
      this.runId,
    );
    this.buyingPower += quantity * price;
  }

  log(text: string) {
    TradeLogger.logToStrategy(text, `Run${this.getId()}`);
  }

  private async notifyEntry(action: IEnterAction) {
    if (!this.options.notifyOnEntry) {
      return;
    }
    try {
      await EntryNotificationService.sendEntryNotification({
        orderType: action.orderType,
        price: action.price,
        strategyName: this.getStrategyName(),
        symbol: action.symbol,
        time: action.time,
      });
    } catch (error) {
      this.log(
        "Failed to send entry notification for " +
          action.symbol +
          ": " +
          JSON.stringify(error),
      );
    }
  }
}
