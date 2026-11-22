import {
  IAction,
  IEnterAction,
  IFlagFilterGroupPair,
  IStrategy,
} from "../../types/strategy-types";
import { StockTradeUtil } from "../utilities/stock-trade";
import {
  IAllFilterData,
  IFilterData,
  IStockData,
  IStockScreenerJob,
} from "../../types/data-processing-types";
import { CONSTANTS, PeriodType } from "../constants";
import { Screener } from "./screener";
import { VariablePatterns } from "../utilities/variable-patterns";
import { StrategyUtil } from "../utilities/strategy-util";

interface IPosition {
  price: number;
  enterTime: number;
  screener: Screener;
  long: boolean;
  quantity: number;
  highestGainPercent?: number;
  lowestLossPercent?: number;
  highestGainTime?: number;
  lowestLossTime?: number;
  timeSinceEntry: number;
}

interface IPositionMap {
  [key: string]: IPosition;
}
export abstract class StrategyRun implements IStockScreenerJob {
  protected positions: IPositionMap;
  private screeners: Screener[] = new Array<Screener>();
  private strategy: IStrategy;
  // config: IStrategyRun;
  protected started = false;
  private vars: IFilterData = {};
  protected closeTime: number;
  private allFlags: IFlagFilterGroupPair[] = [];
  /* TODO should we make this configurable? */
  protected buyingPower = 15000;
  protected tradeSize = 1500;

  protected stockMap: { [key: string]: boolean } = {};

  constructor(strategy: IStrategy) {
    this.strategy = strategy;
    const period = strategy.period;
    //all positions will be closed at this time

    if (period === PeriodType.HOUR) {
      this.closeTime = 930;
    } else if (period === PeriodType.DAY) {
      this.closeTime = 960;
    } else {
      this.closeTime = CONSTANTS.END_TIME - period;
    }
    for (const screener of strategy.screeners) {
      this.screeners.push(new Screener(screener));
    }
    this.allFlags = this.getAllFlags();
    this.positions = {};
  }

  getName() {
    return this.strategy.name;
  }

  getConfigId(): number {
    return this.strategy.id;
  }

  getAllFlags(): IFlagFilterGroupPair[] {
    const allFlags: IFlagFilterGroupPair[] = [];
    for (const screener of this.screeners) {
      if (screener.hasFlags()) {
        allFlags.push(...screener.getFlags());
      }
    }
    return [];
  }

  getDefaultAdditionalPeriod(varName: string) {
    if (varName.includes("mtsi")) {
      return PeriodType.MINUTE;
    }
  }

  getCrossPeriodVars(): Partial<IAllFilterData> {
    const crossPeriodVars: Partial<IAllFilterData> = {};
    Object.keys(this.vars).forEach((key) => {
      if (VariablePatterns.vwap.test(key)) {
        const periodType: PeriodType | undefined = StrategyUtil.isPeriodType(
          parseInt(key.substring(4)),
        )
          ? parseInt(key.substring(4))
          : undefined;
        if (periodType) {
          crossPeriodVars[periodType] = {
            vwapNumeratorCumulative: {},
            vwapDenominatorCumulative: {},
          };
        }
      }
    });
    return crossPeriodVars;
  }

  getAdditionalPeriods(): PeriodType[] {
    const variables = this.getAllVariables();
    const periods = new Array<PeriodType>();
    for (const variable of variables) {
      if (VariablePatterns.vwap.test(variable)) {
        const periodType: PeriodType | undefined = StrategyUtil.isPeriodType(
          parseInt(variable.substring(4)),
        )
          ? parseInt(variable.substring(4))
          : undefined;
        if (periodType) {
          periods.push(periodType);
        }
      }
    }

    const uniquePeriods = Array.from(new Set(periods));
    return uniquePeriods;
  }

  getStrategy() {
    return this.strategy;
  }

  protected getPositions() {
    return this.positions;
  }

  protected setPositions(positions: IPositionMap) {
    this.positions = positions;
  }

  protected getStrategyName() {
    return this.strategy.name;
  }

  canRun(minutesSinceStart: number) {
    return (
      (this.getPeriod() >= PeriodType.DAY &&
        minutesSinceStart ==
          CONSTANTS.DAY_PERIOD_TRADE_TIME - CONSTANTS.BEGIN_TIME) ||
      minutesSinceStart % this.getPeriod() == 0
    );
  }

  getPeriod() {
    return this.strategy.period;
  }

  getAllVariables() {
    const allVariables = [];
    for (const screener of this.screeners) {
      allVariables.push(...screener.getAllVariables());
    }
    return allVariables;
  }

  closePositions(data: IStockData[], time: number) {
    for (const item of data) {
      if (this.positions[item.symbol]) {
        const pos = this.positions[item.symbol];
        if (pos.long) {
          this.sell({
            price: item.price,
            orderType: "SELL",
            symbol: item.symbol,
            time,
            atClose: true,
          });
        } else {
          this.buyToCover({
            price: item.price,
            orderType: "BUY_TO_COVER",
            symbol: item.symbol,
            time,
            atClose: true,
          });
        }
      }
    }
  }

  evaluateFlagsWithCycleDetection(
    flags: IFlagFilterGroupPair[],
  ): IFlagFilterGroupPair[] {
    const orderedFlags: IFlagFilterGroupPair[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const flagMap = new Map<string, IFlagFilterGroupPair>(
      flags.map((f) => [f.name, f]),
    );

    function dfs(flagName: string) {
      if (recursionStack.has(flagName)) {
        throw new Error(`Circular dependency detected involving "${flagName}"`);
      }

      if (visited.has(flagName)) {
        return; // already processed
      }

      const flag = flagMap.get(flagName);
      if (!flag) {
        throw new Error(`Flag "${flagName}" not found`);
      }

      recursionStack.add(flagName);

      const filters = [...flag.enter.filters, ...flag.exit.filters];
      const depFlags = filters
        .filter((filter) => filter.varName.startsWith("Flag"))
        .map((filter) => filter.varName.substring(4)); // strip "Flag"

      for (const dep of depFlags) {
        dfs(dep); // recursively process dependencies
      }

      recursionStack.delete(flagName);
      visited.add(flagName);
      orderedFlags.push(flag); // insert only after dependencies
    }

    for (const flag of flags) {
      dfs(flag.name);
    }

    return orderedFlags;
  }

  isCleared() {
    return Object.keys(this.positions).length === 0;
  }

  private getAvailablePurchases() {
    return Math.floor(this.buyingPower / this.tradeSize);
  }

  run(datetime: number, stockData: IStockData[]) {
    const ecm = StockTradeUtil.getMinutesInDay(
      StockTradeUtil.getEastCoastDate(new Date(datetime)),
    ); // used to be a bug here, i took away - CONSTANTS.BEGIN_TIME, but then realized that for daily strategies, the time will be 570 instead of 0, so we should not subtract BEGIN_TIME
    const enterActions = new Array<IEnterAction>();
    const exitActions = new Array<IAction>();
    let availablePurchases = this.getAvailablePurchases();
    if (ecm >= this.closeTime && this.getPeriod() < PeriodType.DAY) {
      if (!this.isCleared()) {
        this.closePositions(stockData, datetime);
      }
      return;
    }

    this.updatePositionSpecificFilterData(stockData, datetime);

    for (const data of stockData) {
      const symbol = data.symbol;
      const price =
        data.tradePrice && this.getPeriod() < PeriodType.DAY
          ? data.tradePrice
          : data.price;
      const pos = this.positions[symbol];

      if (pos) {
        if (
          !StockTradeUtil.periodisEligible(
            ecm,
            this.getPeriod(),
            this.constructor.name === "simulation",
          )
        ) {
          continue;
        }
        if (datetime === pos.enterTime && this.strategy.period !== 1440) {
          console.log(
            "Error in strategynew.run: Should not be running screen where pos.enterTime === time",
          );
          throw Error(
            "Error in strategynew.run: Should not be running screen where pos.enterTime === time",
          );
        }
        const percentChange = 100 * (price / pos.price - 1);
        if (pos.lowestLossPercent && percentChange < pos.lowestLossPercent) {
          pos.lowestLossPercent = percentChange;
          pos.lowestLossTime = datetime;
        } else if (
          pos.highestGainPercent &&
          percentChange > pos.highestGainPercent
        ) {
          pos.highestGainPercent = percentChange;
          pos.highestGainTime = datetime;
        }

        const exit = pos.long
          ? pos.screener.runSellFilters(this.vars, symbol)
          : pos.screener.runCoverFilters(this.vars, symbol);
        if (exit) {
          exitActions.push({
            price,
            orderType: pos.long ? "SELL" : "BUY_TO_COVER",
            symbol,
            time: datetime,
          });
        }
      } else {
        for (const screener of this.screeners) {
          /* why is this here? */
          if (
            !StockTradeUtil.periodisEligible(
              ecm,
              this.getPeriod(),
              this.constructor.name === "StrategySimulation",
            )
          ) {
            throw new Error(
              "period not eligible, for sim: " +
                this.getConfigId() +
                ", time: " +
                new Date(datetime),
            );
            //continue;
          }

          if (screener.hasBuySellFilters()) {
            const enter = screener.runBuyFilters(this.vars, symbol);
            if (enter) {
              enterActions.push({
                price,
                orderType: "BUY",
                symbol,
                screener,
                time: datetime,
              });
            }
          }
          if (screener.hasShortCoverFilters()) {
            const enter = screener.runShortFilters(this.vars, symbol);
            if (enter) {
              enterActions.push({
                price,
                orderType: "SELL_SHORT",
                symbol,
                screener,
                time: datetime,
              });
            }
          }
        }
      }
    }
    for (const action of enterActions) {
      if (availablePurchases > 0) {
        availablePurchases--;
        if (action.orderType === "BUY") {
          this.buy(action);
        } else {
          this.sellShort(action);
        }
      }
    }
    for (const action of exitActions) {
      availablePurchases++;
      if (action.orderType === "SELL") {
        this.sell(action);
      } else {
        this.buyToCover(action);
      }
    }
  }

  updatePositionSpecificFilterData(stockData: IStockData[], datetime: number) {
    const prices: { [key: string]: number } = {};
    const tradePrices: { [key: string]: number } = {};
    for (const item of stockData) {
      const price = item.price;
      const tradePrice = item.tradePrice;
      const symbol = item.symbol;
      prices[symbol] = price;
      if (tradePrice) {
        tradePrices[symbol] = tradePrice;
      }
    }
    const positions = this.getPositions();
    const period = this.getPeriod();
    const calculations = {
      percentGain: (stock: string) =>
        100 *
        ((tradePrices[stock] ?? prices[stock]) / positions[stock].price - 1),
      timeSinceEntry: (stock: string) =>
        Math.round(
          (datetime - positions[stock].enterTime) /
            (period * CONSTANTS.MILLIS_IN_MINUTE),
        ),
    };
    this.getAllVariables().forEach((variable: string) => {
      Object.entries(positions).forEach(([stock]) => {
        const sVars = this.getVars();
        sVars[variable] ||= {};
        if (variable === "percentGain") {
          sVars[variable][stock] = calculations.percentGain(stock);
        } else if (variable === "timeSinceEntry") {
          positions[stock].timeSinceEntry++;
          if (
            positions[stock].timeSinceEntry > 1 &&
            sVars["timeSinceEntry"] &&
            !sVars["timeSinceEntry"][stock]
          ) {
            //TODO investigate why this is getting logged for for back-test.test.ts
            console.log(
              "Error: timeSinceEntry should be getting updated every period, but it is not updating for stock: " +
                stock +
                ", strategy: " +
                this.getStrategyName(),
            );
            //throw new Error('Error: timeSinceEntry should be getting updated every period, but it is not updating for stock: ' + stock + ', strategy: ' + this.getStrategyName());
          }
          sVars[variable][stock] = positions[stock].timeSinceEntry; // calculations.timeSinceEntry(stock);
        }
      });
    });
  }

  strategySpecificCalculations(
    prices: { [key: string]: number },
    variable: string,
    stock: string,
  ) {
    // so the compiloer doesnt complain TODO
    const datetime = 0;
    if (variable.toLowerCase().includes("percentgain")) {
      return 100 * (prices[stock] / this.positions[stock].price - 1);
    } else if (variable.toLowerCase().includes("timeSinceEntry")) {
      return Math.round(
        (datetime - this.positions[stock].enterTime) /
          (this.getPeriod() * CONSTANTS.MILLIS_IN_MINUTE),
      );
    }
  }

  calculateGain(enterPrice: number, exitPrice: number, long: boolean) {
    if (!long) {
      return (enterPrice + (enterPrice - exitPrice)) / enterPrice;
    } else {
      return exitPrice / enterPrice;
    }
  }

  protected buy(action: IEnterAction) {
    this.positions[action.symbol] = {
      timeSinceEntry: 0,
      highestGainPercent: 0,
      lowestLossPercent: 0,
      lowestLossTime: action.time,
      highestGainTime: action.time,
      enterTime: action.time,
      long: true,
      screener: action.screener,
      price: action.price,
      quantity: Math.floor(this.tradeSize / action.price),
    };
  }

  protected sellShort(action: IEnterAction) {
    this.positions[action.symbol] = {
      timeSinceEntry: 0,
      highestGainPercent: 0,
      lowestLossPercent: 0,
      enterTime: action.time,
      long: false,
      screener: action.screener,
      price: action.price,
      quantity: Math.floor(this.tradeSize / action.price),
    };
  }

  protected sell(action: IAction) {
    // what we'll do is create a unit test, buy a stock, check timeSinceEntry, sell the stock, buy the stock again, run the run() function and check that timeSinceEntry has been reset
    // have to remove timeSinceEntry from vars when we sell, otherwise it will mess up calculations for future buys of the same stock, and remove percentGain
    delete this.positions[action.symbol];
  }

  protected buyToCover(action: IAction) {
    delete this.positions[action.symbol];
  }

  setVars(vars: IFilterData) {
    this.vars = vars;
  }

  getVars() {
    return this.vars;
  }
}
