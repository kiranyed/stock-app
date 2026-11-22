import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { GainsAnalyzer } from "../analysis/analyze-gains";
import { StrategyRun } from "../shared/classes/strategy-run";
import {
  IAction,
  IEnterAction,
  IGain,
  IStrategy,
} from "../types/strategy-types";
import { IGainTotal, ICandle } from "../types/back-test-types";
import { IStockData } from "../types/data-processing-types";

export class BackTest extends StrategyRun {
  gains = new Array<IGain>();
  processedGains: IGainTotal = {
    gains: [],
    total: 0,
    tradeNum: 0,
    avgTrade: 0,
    name: "",
  };
  previousClose = 0;
  constructor(strat: IStrategy) {
    super(strat);
  }

  // add this to interface
  reset(fullReset = false) {
    if (!fullReset) {
      return;
    }
    this.setPositions({});
  }

  getTestResults() {
    new GainsAnalyzer(this.gains);
    const totalGains = StockTradeUtil.addGains(this.gains);
    const gainsLength = this.gains.length;
    this.reset(true);

    this.processedGains = {
      gains: this.formatGains(),
      total: totalGains,
      tradeNum: this.gains.length,
      avgTrade: totalGains / gainsLength,
      name: this.getStrategyName(),
    };
    return this.processedGains;
  }

  formatGains() {
    return this.gains.map((gain) => ({
      symbol: gain.symbol,
      gainPercent: Math.round((gain.gain - 1) * 10000) / 100,
      timeFormatted: `${StockTradeUtil.getEastCoastDate(new Date(gain.time)).toLocaleDateString()} ${StockTradeUtil.getEastCoastDate(new Date(gain.time)).toLocaleTimeString()}`,
      atClose: gain.atClose,
      enteredTimeFormatted: gain.enteredTime
        ? `${StockTradeUtil.getEastCoastDate(new Date(gain.enteredTime)).toLocaleDateString()} ${StockTradeUtil.getEastCoastDate(new Date(gain.enteredTime)).toLocaleTimeString()}`
        : "",
      enteredTime: gain.enteredTime,
      time: gain.time,
    }));
  }

  run(datetime: number, stockData: IStockData[]) {
    super.run(datetime, stockData);
  }

  // get time (in minutes after midnight)
  getTime(candle: ICandle) {
    return StockTradeUtil.getMinutesInDayEastCoast(new Date(candle.datetime));
  }

  protected buy(action: IEnterAction) {
    super.buy(action);
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
  }

  protected sellShort(action: IEnterAction) {
    super.sellShort(action);
    this.buyingPower -= this.positions[action.symbol].quantity * action.price;
  }

  protected sell(action: IAction, atClose = false) {
    const price = action.price;
    const position = this.positions[action.symbol];
    const gain = action.price / position.price;
    this.gains.push({
      symbol: action.symbol,
      gain,
      highestGainPercent: position.highestGainPercent,
      lowestLossPercent: position.lowestLossPercent,
      highestGainTime: position.highestGainTime,
      lowestLossTime: position.lowestLossTime,
      time: action.time,
      atClose,
      enteredTime: position.enterTime,
    });
    const quantity = position.quantity;
    super.sell(action);
    this.buyingPower += quantity * price;
  }

  protected buyToCover(action: IAction, atClose = false) {
    const price = action.price;
    const prevPrice = this.positions[action.symbol].price;
    const position = this.positions[action.symbol];
    const gain = (prevPrice + (prevPrice - price)) / prevPrice;
    this.gains.push({
      symbol: action.symbol,
      gain,
      time: action.time,
      atClose,
      highestGainPercent: position.highestGainPercent,
      lowestLossPercent: position.lowestLossPercent,
    });
    const quantity = position.quantity;
    super.buyToCover(action);
    this.buyingPower += quantity * price;
  }

  clearPositions() {
    this.positions = {};
  }
}
