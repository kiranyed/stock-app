import { SchwabAPI } from "../shared/services/trading-api";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { TradeLogger } from "../shared/utilities/trade-logger";
import { IAction, IEnterAction, IStrategy } from "../types/strategy-types";
import TransactionRepository from "../shared/services/repos/transaction-repository";
import {
  ILiveStockScreenerJob,
  IStockData,
} from "../types/data-processing-types";
import { StrategySimulation } from "./strategy-simulation";
import { CONSTANTS } from "../shared/constants";

interface IPendingAction extends IAction {
  currentQuantity: number;
  targetQuantity: number;
}

interface IEnterPendingAction extends IEnterAction {
  currentQuantity: number;
  targetQuantity: number;
}

type Position = Record<string, { amount: number; cost: number }>;
type Order = { quantity: number; remainingQuantity: number };

export class RealMoneyStrategy
  extends StrategySimulation
  implements ILiveStockScreenerJob
{
  logTrade(action: IAction) {
    TradeLogger.logToStrategy(
      "Trade made: " + JSON.stringify(action),
      this.getStrategyName(),
    );
  }
  updateTransaction(transaction: {
    id: number;
    symbol: string;
    quantity: number;
    price: number;
  }) {
    TradeLogger.logToStrategy(
      "Transaction made: " + JSON.stringify(transaction),
      this.getStrategyName(),
    );
  }

  // existingPositions is the positions I already had before running this strategy
  paused = false;
  existingPositions: { [key: string]: number };
  IDsToCancel: string[] = [];
  pendingExitActions: { [key: string]: IPendingAction } = {};
  pendingEnterActions: { [key: string]: IEnterPendingAction } = {};

  id: number = 0;

  constructor(strat: IStrategy) {
    super(strat);
    this.existingPositions = {};
    this.logError = this.logError.bind(this);
    this.initializeExistingPositions();
    this.closeTime = 930;
  }

  // TODO we need to be creating the runs in the database first, and then getting
  // the ids, and then creating these StrategyRun instances.  that way, we can
  // create the log files in the constructor instead of setId
  setId(id: number) {
    this.id = id;
    TradeLogger.initializeStrategyLog(`Run${id}`);
    TradeLogger.initializeStrategyLog(`Run${id}-errors`);
  }

  getId() {
    return this.id;
  }

  log(text: string) {
    TradeLogger.logToStrategy(text, `Run${this.getId()}`);
  }

  logError(text: string) {
    TradeLogger.logError(text, `Run${this.getId()}`);
  }

  /* store values of existing positions in variable */
  initializeExistingPositions() {
    const existingPositions = this.existingPositions;
    SchwabAPI.getAccountPositions().then((positions) => {
      //TODO handle case where positions is undefined. add a test case for this
      if (!positions) {
        this.log("no existing positions to initialize");
        return;
      }
      for (const pos of positions) {
        if (pos.longQuantity > 0) {
          existingPositions[pos.instrument.symbol] = pos.longQuantity;
        } else {
          existingPositions[pos.instrument.symbol] = pos.shortQuantity;
        }
      }
      this.log(
        "initialized existing positions: " +
          Object.keys(this.existingPositions).length,
      );
    });
  }

  get minutesInDay() {
    return StockTradeUtil.getMinutesInDayEastCoast(new Date());
  }

  /* check if my "positions" variable matches up with my actual account */
  async syncPositions(datetime: number) {
    const positions = await SchwabAPI.getAccountPositions() ?? []; // if there's no positions, just make it an empty array
    const existingPositions = this.existingPositions;
    const currentPositions = { ...this.positions };
    //const pendingActions = this.pendingExitActions;
    const names: { [key: string]: number } = {};
    const log = this.log;
    const unexpectedPositions: Position = {};
    try {
      for (const pos of positions) {
        const symbol = pos.instrument.symbol;
        const pendingActions = this.pendingEnterActions;
        if (
          pendingActions[symbol] &&
          (pendingActions[symbol].orderType === "BUY" ||
            pendingActions[symbol].orderType === "SELL_SHORT")
        ) {
          if (!currentPositions[symbol]) {
            const screener = pendingActions[symbol].screener;
            if (pos.longQuantity > 0) {
              const netQuantity = existingPositions[symbol]
                ? existingPositions[symbol] - pos.longQuantity
                : pos.longQuantity;
              this.buy(
                {
                  symbol,
                  price: pos.averagePrice,
                  orderType: "BUY",
                  screener,
                  time: datetime,
                },
                true,
                netQuantity,
              );
            } else {
              const netQuantity = existingPositions[symbol]
                ? existingPositions[symbol] - pos.shortQuantity
                : pos.shortQuantity;
              this.sellShort(
                {
                  symbol,
                  price: pos.averagePrice,
                  orderType: "SELL_SHORT",
                  screener,
                  time: datetime,
                },
                true,
                netQuantity,
              );
            }
          } else {
            if (pos.longQuantity > 0) {
              const netQuantity = existingPositions[symbol]
                ? existingPositions[symbol] - pos.longQuantity
                : pos.longQuantity;
              this.positions[symbol].quantity = netQuantity;
              pendingActions[symbol].currentQuantity = netQuantity;
              if (netQuantity >= pendingActions[symbol].targetQuantity) {
                delete pendingActions[symbol];
              }
            } else {
              const netQuantity = existingPositions[symbol]
                ? existingPositions[symbol] - pos.shortQuantity
                : pos.shortQuantity;
              this.positions[symbol].quantity = netQuantity;
              pendingActions[symbol].currentQuantity = netQuantity;
              if (netQuantity >= pendingActions[symbol].targetQuantity) {
                delete pendingActions[symbol];
              }
            }
          }
        } else if (currentPositions[symbol]) {
          names[symbol] =
            pos.longQuantity > 0 ? pos.longQuantity : pos.shortQuantity;
        } else if (!existingPositions[symbol]) {
          log("position that wasn't pending: " + symbol);
          if (pos.longQuantity > 0) {
            unexpectedPositions[symbol] = {
              amount: pos.longQuantity,
              cost: 0,
            };
          } else {
            unexpectedPositions[symbol] = {
              amount: -1 * pos.shortQuantity,
              cost: 0,
            };
          }
        }
      }
      
      this.closeUnexpectedPositions(unexpectedPositions);

      for (const key of Object.keys(currentPositions)) {
        const pos = currentPositions[key];
        const pendingAction = this.pendingExitActions[key];
        if (pendingAction) {
          if (
            pendingAction.orderType === "SELL" ||
            pendingAction.orderType === "BUY_TO_COVER"
          ) {
            if (!names[key]) {
              if (pos.long) {
                this.sell(this.pendingExitActions[key], true);
              } else {
                this.buyToCover(this.pendingExitActions[key], true);
              }
            } else {
              this.positions[key].quantity = names[key];
            }
          }
        }
      }
    } catch (err) {
      console.log(err);
      log("in syncpositions: " + JSON.stringify(err));
    }
  }

  /* close any positions that were unexpectedly bought or sold short.  don't think this ever actually happens,
    but just in case */
  closeUnexpectedPositions(positions: Position) {
    const logError = this.logError;
    const symbols = Object.keys(positions).join(",");
    SchwabAPI.getStockDataMultiple(symbols).then((data) => {
      for (const symbol of Object.keys(data)) {
        const item = data[symbol];
        if (positions[symbol]?.amount > 0) {
          SchwabAPI.sellStock(
            symbol,
            item.quote.lastPrice!,
            positions[symbol].amount,
          ).catch((err) => {
            logError(
              "err attempting to close unexpected position for " +
                symbol +
                ": " +
                JSON.stringify(err),
            );
          });
        } else {
          SchwabAPI.buyToCoverStock(
            symbol,
            item.quote.lastPrice!,
            -1 * positions[symbol].amount,
          ).catch((err) => {
            logError(
              "err attempting to close unexpected position for " +
                symbol +
                ": " +
                JSON.stringify(err),
            );
          });
        }
      }
    });
  }

  /* store transaction info in DB*/
  async calculateTransactions() {
    const date = StockTradeUtil.getEastCoastDate();
    let monthString = "" + (date.getMonth() + 1);
    if (monthString.length < 2) {
      monthString = "0" + monthString;
    }

    const openPositions: Position = {};
    const dateString =
      date.getFullYear() + "-" + monthString + "-" + date.getDate();
    const trades = await SchwabAPI.getTrades({
      start: dateString,
      end: dateString,
    });

    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].type === "TRADE") {
        const trade = trades[i];
        const item = trade.transactionItem;
        const symbol = item.instrument.symbol;
        // if (existingPositions[symbol]) {
        //     continue;
        // }
        switch (trade.description) {
          case "BUY TRADE":
          case "SHORT SALE":
            openPositions[symbol] = { amount: item.amount, cost: item.cost };
            break;
          case "SELL TRADE":
          case "CLOSE SHORT POSITION": {
            if (!openPositions[symbol]) {
              this.logError(
                "No matching open position when calculating transactions for " +
                  symbol + " at " + date.toString() + " with trade " + JSON.stringify(trade),
              );
              break;
            }
            const difference = item.cost + openPositions[symbol].cost;
            const gainPercent = (difference / item.cost) * 100;
            this.recordPositionReal(
              symbol,
              difference,
              gainPercent,
              trade.description === "SELL TRADE",
            );
            delete openPositions[symbol];
            break;
          }
        }
      }
    }
  }

  protected buy(
    action: IEnterAction,
    syncPositions = false,
    overrideQuantity = 0,
  ) {
    if (syncPositions) {
      const pendingAction = this.pendingEnterActions[action.symbol];
      super.buy(action);
      if (overrideQuantity) {
        this.positions[action.symbol].quantity = overrideQuantity;
        if (pendingAction) {
          if (overrideQuantity >= pendingAction.targetQuantity) {
            delete this.pendingEnterActions[action.symbol];
          } else {
            pendingAction.currentQuantity = overrideQuantity;
          }
        }
      }
    } else {
      this.pendingEnterActions[action.symbol] = {
        ...action,
        currentQuantity: 0,
        targetQuantity: Math.ceil(
          this.tradeSize / parseFloat(action.price.toFixed(2)),
        ),
        price: action.price,
      };
      this.doEnterMarket(action);
    }
  }

  protected sellShort(
    action: IEnterAction,
    syncPositions = false,
    overrideQuantity = 0,
  ) {
    if (syncPositions) {
      const pendingAction = this.pendingEnterActions[action.symbol];
      super.sellShort(action);
      if (overrideQuantity) {
        this.positions[action.symbol].quantity = overrideQuantity;
        if (pendingAction) {
          if (overrideQuantity >= pendingAction.targetQuantity) {
            delete this.pendingEnterActions[action.symbol];
          } else {
            pendingAction.currentQuantity = overrideQuantity;
          }
        }
      }
    } else {
      this.pendingEnterActions[action.symbol] = {
        ...action,
        currentQuantity: 0,
        targetQuantity: Math.ceil(
          this.tradeSize / parseFloat(action.price.toFixed(2)),
        ),
        price: action.price,
      };
      this.doEnterMarket(action);
    }
  }

  protected sell(action: IAction, syncPositions = false) {
    if (syncPositions) {
      delete this.pendingExitActions[action.symbol];
      super.sell(action);
    } else {
      this.pendingExitActions[action.symbol] = {
        ...action,
        currentQuantity: 0,
        targetQuantity: Math.ceil(
          this.tradeSize / parseFloat(action.price.toFixed(2)),
        ),
        price: action.price,
      };
      this.doExitMarket(action);
    }
  }

  protected buyToCover(action: IAction, syncPositions = false) {
    if (syncPositions) {
      delete this.pendingExitActions[action.symbol];
      super.buyToCover(action);
    } else {
      this.pendingExitActions[action.symbol] = {
        ...action,
        currentQuantity: 0,
        targetQuantity: Math.ceil(
          this.tradeSize / parseFloat(action.price.toFixed(2)),
        ),
        price: action.price,
      };
      this.doExitMarket(action);
    }
  }

  /* record position in the DB */
  recordPositionReal(
    symbol: string,
    difference: number,
    gainPercent: number,
    long: boolean,
  ) {
    const date = StockTradeUtil.getEastCoastDate();
    if (symbol) {
      TransactionRepository.recordTransaction(
        symbol,
        date.getTime(),
        difference,
        gainPercent,
        long,
        this.id,
      );
    } else {
      throw new Error("Unknown symbol " + symbol);
    }
  }

  async closePositions(data: IStockData[], time: number) {
    await this.syncPositions(time);
    super.closePositions(data, time);
  }

  async run(datetime: number, results: IStockData[]) {
    await this.prepareForRun();
    super.run(datetime, results);
  }

  prepareForRun = async () => {
    // add option to sync every so often?
    const curTimeInMillis = Date.now();
    this.buyingPower = await SchwabAPI.getBuyingPower();
    await this.syncPositions(curTimeInMillis);
    if (this.IDsToCancel.length > 0) {
      await this.cancelOrders(this.IDsToCancel);
      this.IDsToCancel = [];
    }
    this.started = true;
    
  };

  /* cancel outstanding order based on order IDs passed */
  cancelOrders(IDs: string[]) {
    const promises = new Array<Promise<unknown>>();
    const ordersToDelete = new Array<{
      id: string;
      symbol: string;
      type: string;
    }>();
    const symbols = new Array<string>();
    const log = this.log;
    const logError = this.logError;
    for (const ID of IDs) {
      promises.push(SchwabAPI.cancelOrder(ID));
    }
    //TODO fix start and end time
    return SchwabAPI.getPendingOrders({ start: 1, end: 2 })
      .then((orders) => {
        for (const order of orders) {
          if (IDs.indexOf(order.orderId) > -1) {
            ordersToDelete.push({
              type: order.orderLegCollection[0].instruction,
              id: order.orderId,
              symbol: order.orderLegCollection[0].instrument.symbol,
            });
            symbols.push(order.orderLegCollection[0].instrument.symbol);
            promises.push(SchwabAPI.cancelOrder(order.orderId));
          }
        }
        return Promise.all(promises);
      })
      .then(() => {
        for (const order of ordersToDelete) {
          log("Cancelled order id: " + order.id);
          if (order.type === "BUY" || order.type === "SELL_SHORT") {
            delete this.pendingEnterActions[order.symbol];
          } else {
            delete this.pendingExitActions[order.symbol];
          }
        }
      })
      .catch((err) => {
        logError("Error cancelling old pending orders: " + JSON.stringify(err));
      });
  }

  /* cancel all orders */
  cancelOldPendingOrders = () => {
    return SchwabAPI.getPendingOrders({ start: 1, end: 2 })
      .then((orders) => {
        const IDs = new Array<string>();
        for (const order of orders) {
          const enteredTime = order.enteredTime;
          const symbol = order.orderLegCollection[0].instrument.symbol;
          if (
            Math.round(
              (Date.now() - enteredTime) / CONSTANTS.MILLIS_IN_MINUTE,
            ) >= 3
          ) {
            IDs.push(order.orderId);
            if (
              order.orderLegCollection[0].instruction === "BUY" ||
              order.orderLegCollection[0].instruction === "SELL_SHORT"
            ) {
              delete this.pendingEnterActions[symbol];
            } else {
              delete this.pendingExitActions[symbol];
            }
          }
        }
        return IDs;
      })
      .then((IDs) => {
        const promises = new Array<Promise<unknown>>();
        for (const ID of IDs) {
          promises.push(SchwabAPI.cancelOrder(ID));
        }
        return Promise.all(promises);
      })
      .catch((err) => {
        this.logError(
          "Error cancelling old pending orders: " + JSON.stringify(err),
        );
      });
  };

  /* enter a position */
  async doEnter(action: IAction) {
    const { orderType, symbol } = action;
    const price =
      orderType === "BUY" || orderType === "BUY_TO_COVER"
        ? action.price * 1.0001
        : action.price * 0.9999;
    let orderId = "";
    const log = this.log;
    const logError = this.logError;
    /* see if you can afford */
    try {
      const q = Math.ceil(this.tradeSize / parseFloat(price.toFixed(2)));
      if (orderType === "BUY") {
        // const a = this.tradeSize / parseFloat(price.toFixed(2));
        // const q = Math.ceil(this.tradeSize / parseFloat(price.toFixed(2)));
        SchwabAPI.buyStock(symbol, parseFloat(price.toFixed(2)), q)
          .then((loc) => {
            orderId = this.parseForOrder(loc);
            log("Order id: " + orderId + " for " + symbol);
            log("Buy order made for " + symbol);
            return this.verifyOrderDone(orderId, orderType, price);
          })
          .catch((err) => {
            delete this.pendingEnterActions[symbol];
            logError("buying stock in doEnter: " + JSON.stringify(err));
            // throw err;
          });
      } else {
        SchwabAPI.shortStock(symbol, parseFloat(price.toFixed(2)), q)
          .then((loc) => {
            orderId = this.parseForOrder(loc);
            log("Order id: " + orderId + " for " + symbol);
            log("Short order made for " + symbol);
            return this.verifyOrderDone(orderId, orderType, price);
          })
          .catch((err) => {
            delete this.pendingEnterActions[symbol];
            logError("shorting stock in doEnter: " + JSON.stringify(err));
            // throw err;
          });
      }
    } catch (error) {
      logError(JSON.stringify(error));
    }
  }

  /* exit a position */
  async doExit(action: IAction) {
    const { orderType, symbol } = action;
    const price =
      orderType === "BUY" || orderType === "BUY_TO_COVER"
        ? action.price * 1.0001
        : action.price * 0.9999;
    // const quantity = Math.ceil(this.tradeSize / price);
    const quantity = this.positions[symbol].quantity;
    let orderId = "";
    const log = this.log;
    const logError = this.logError;
    try {
      if (orderType === "SELL") {
        SchwabAPI.sellStock(symbol, parseFloat(price.toFixed(2)), quantity)
          .then((loc) => {
            orderId = loc.substring(loc.indexOf("orders/") + "orders/".length);
            log("Sell order placed for " + symbol);
            return this.verifyOrderDone(orderId, orderType, price);
          })
          .catch((err) => {
            delete this.pendingExitActions[symbol];
            logError("selling stock in doExit: " + JSON.stringify(err));
            // throw err;
          });
      } else {
        SchwabAPI.buyToCoverStock(
          symbol,
          parseFloat(price.toFixed(2)),
          quantity,
        )
          .then((loc) => {
            orderId = loc.substring(loc.indexOf("orders/") + "orders/".length);
            log("Buy to cover order made for " + symbol);
            return this.verifyOrderDone(orderId, orderType, price);
          })
          .catch((err) => {
            delete this.pendingExitActions[symbol];
            logError("covering stock in doExit: " + JSON.stringify(err));
            // throw err;
          });
      }
    } catch (error) {
      logError(String(error));
    }
  }

  /* get order id */
  parseForOrder(location: string) {
    return location.substring(location.indexOf("orders/") + "orders/".length);
  }

  /* verify that the order is filled */
  verifyOrderDone(orderId: string, orderType: string, price: number) {
    let interval: NodeJS.Timeout;
    const log = this.log;
    const logError = this.logError;
    return new Promise<void>((resolve, reject) => {
      try {
        let totalQuantity = 0;
        let remainingQuantity = 0;
        let attemps = 0;
        // let interval: NodeJS.Timeout = new NodeJS.Timeout();
        const originalPrice = price;
        let lastPrice = price;
        const buying = orderType === "BUY" || orderType === "BUY_TO_COVER";
        const enter = orderType === "BUY" || orderType === "SELL_SHORT";
        const entering = orderType === "BUY" || orderType === "SELL_SHORT";
        let sData: Order = { quantity: 0, remainingQuantity: 0 };
        interval = setInterval(() => {
          // try {
          SchwabAPI.getOrder(orderId)
            .then((data) => {
              sData = data;
              return SchwabAPI.getStock(
                data.orderLegCollection[0].instrument.symbol,
              );
            })
            .then((stockData) => {
              if (!totalQuantity) {
                totalQuantity = sData.quantity;
              }
              remainingQuantity = sData.remainingQuantity;
              const stockDataQuote = stockData.quote;
              const currentPrice = stockDataQuote.lastPrice!;
              if (
                remainingQuantity > 0 &&
                ((attemps < 4 && enter) || (!enter && attemps < 10))
              ) {
                // const replace = currentPrice > lastPrice && ();
                if (
                  (currentPrice > lastPrice &&
                    enter &&
                    originalPrice * 1.0025 >= currentPrice) ||
                  (currentPrice < lastPrice && !enter)
                ) {
                  const newPrice = buying
                    ? currentPrice * 1.0004
                    : currentPrice * 0.9998;
                  log(
                    "Attempting to replace order" +
                      orderId +
                      "for " +
                      stockData.symbol +
                      "with new price: " +
                      newPrice,
                  );
                  return SchwabAPI.replaceOrder(
                    orderId,
                    stockData.symbol,
                    parseFloat(newPrice.toFixed(2)),
                    orderType,
                    remainingQuantity,
                  )
                    .then((unfilteredLoc) => {
                      orderId = this.parseForOrder(unfilteredLoc);
                      attemps = 0;
                      log("Replaced " + stockData.symbol);
                    })
                    .catch((err) => {
                      logError("Error replacing order: " + JSON.stringify(err));
                      clearInterval(interval);
                      this.IDsToCancel.push(orderId);
                      resolve();
                    });
                  //  const unfiltedloc = await TDAccountAPI.replaceOrder(orderId, stockData.symbol,
                  //       parseFloat(newPrice.toFixed(2)), orderType, remainingQuantity);
                  //  orderId = this.parseForOrder(unfiltedloc);
                  //  attemps = 0;
                  //  log('Replaced ' + stockData.symbol);
                } else {
                  attemps++;
                }
              } else {
                if (attemps > 1) {
                  log(
                    "Attemps greater than 1 for stock + " +
                      stockData.symbol +
                      " -- " +
                      attemps,
                  );
                }
                if (remainingQuantity > 0) {
                  return SchwabAPI.cancelOrder(orderId)
                    .then(() => {
                      log(orderId + " Order canceled");
                      if (remainingQuantity === totalQuantity) {
                        log("deleting pending action, position not entered");
                        if (entering) {
                          delete this.pendingEnterActions[stockData.symbol];
                        } else {
                          delete this.pendingExitActions[stockData.symbol];
                        }
                      } else {
                        log(
                          "settling with partial position for: " +
                            stockData.symbol,
                        );
                        if (entering) {
                          this.pendingEnterActions[
                            stockData.symbol
                          ].currentQuantity = totalQuantity - remainingQuantity;
                        } else {
                          this.pendingExitActions[
                            stockData.symbol
                          ].currentQuantity = totalQuantity - remainingQuantity;
                        }
                      }
                      clearInterval(interval);
                      resolve();
                    })
                    .catch((err) => {
                      logError("Error canceling order: " + JSON.stringify(err));
                      clearInterval(interval);
                      this.IDsToCancel.push(orderId);
                    });
                }
                clearInterval(interval);
                resolve();
                // resolve(buying ? totalQuantity - remainingQuantity : sale);
              }
              lastPrice = currentPrice;
            })
            .catch((err) => {
              logError("in verifyOrderDone: " + JSON.stringify(err));
              clearInterval(interval);
              this.IDsToCancel.push(orderId);
              resolve();
              // throw err;
            });
          // } catch (err) {
          //     clearInterval(interval);
          //     reject(err);
          // }
        }, 31 * 1000);
      } catch (err) {
        if (interval) {
          clearInterval(interval);
        }
        logError("rejecting in verifyOrderDone");
        reject(err);
      }
    });
  }

  /* idk what this is */
  // verifyOrderDone2(orderIds: string[]) {
  //     // TDAccountAPI.getPendingOrders({ start: '', end: '' })
  //     let symbolsToCheck = new Array<string>();
  //     interval = setInterval(() => {
  //         TDAccountAPI.getPendingOrders()
  //         .then(orders => {
  //             for (const order of orders) {
  //                 if (orderIds.indexOf(order.orderId) > -1) {
  //                     orders.push(order);
  //                     symbolsToCheck.push(order.orderLegCollection[0].instrument.symbol);
  //                 }
  //             }
  //             return TDAccountAPI.getStocks(symbolsToCheck.join(','));
  //         });
  //         symbolsToCheck = [];
  //     }, 31000);
  // }

  /* ??? */
  doAllOrders(actions: IAction[]): Promise<string[]> {
    const totalActions = actions.length;
    let completedActions = 0;
    const orderIds = new Array<string>();
    const doExitMarket = this.doExitMarket;
    const doEnterMarket = this.doEnterMarket;
    return new Promise<string[]>((resolve, reject) => {
      setTimeout(() => {
        if (completedActions < totalActions) {
          console.log("timed out");
          reject();
        } else {
          console.log("no clue what happened");
          reject();
        }
      }, 6000);
      for (const action of actions) {
        if (action.orderType === "BUY" || action.orderType === "SELL_SHORT") {
          doEnterMarket(action)
            .then((id) => {
              orderIds.push(id);
            })
            .catch((err) => {
              console.log(err);
            })
            .finally(() => {
              completedActions++;
              if (completedActions === totalActions) {
                resolve(orderIds);
              }
            });
        } else {
          doExitMarket(action)
            .then((id) => {
              orderIds.push(id);
            })
            .catch((err) => {
              console.log(err);
            })
            .finally(() => {
              completedActions++;
              if (completedActions === totalActions) {
                resolve(orderIds);
              }
            });
        }
      }
    });
  }

  /* simple doExit  */
  doExitMarket(action: IAction) {
    const { orderType, symbol } = action;
    const price =
      orderType === "BUY" || orderType === "BUY_TO_COVER"
        ? action.price * 1.0001
        : action.price * 0.9999;
    const quantity = this.positions[symbol].quantity;
    let orderId = "";
    const log = this.log;
    if (orderType === "SELL") {
      return SchwabAPI.sellStock(
        symbol,
        parseFloat(price.toFixed(2)),
        quantity,
        false,
      ).then((loc) => {
        orderId = loc.substring(loc.indexOf("orders/") + "orders/".length);
        log("Sell order placed for " + symbol);
        return orderId;
      });
    } else {
      return SchwabAPI.buyToCoverStock(
        symbol,
        parseFloat(price.toFixed(2)),
        quantity,
        false,
      ).then((loc) => {
        orderId = loc.substring(loc.indexOf("orders/") + "orders/".length);
        log("Buy to cover order made for " + symbol);
        return orderId;
      });
    }
  }

  /* simple doEnter */
  doEnterMarket(action: IAction): Promise<string> {
    const { orderType, symbol } = action;
    const price =
      orderType === "BUY" || orderType === "BUY_TO_COVER"
        ? action.price * 1.0001
        : action.price * 0.9999;
    let orderId = "";
    const log = this.log;
    /* see if you can afford */
    const q = Math.ceil(this.tradeSize / parseFloat(price.toFixed(2)));
    if (orderType === "BUY") {
      return SchwabAPI.buyStock(
        symbol,
        parseFloat(price.toFixed(2)),
        q,
        false,
      ).then((loc) => {
        orderId = this.parseForOrder(loc);
        log("Order id: " + orderId + " for " + symbol);
        log("Buy order made for " + symbol);
        return orderId;
      });
    } else {
      return SchwabAPI.shortStock(
        symbol,
        parseFloat(price.toFixed(2)),
        q,
        false,
      ).then((loc) => {
        orderId = this.parseForOrder(loc);
        log("Order id: " + orderId + " for " + symbol);
        log("Short order made for " + symbol);
        return orderId;
      });
    }
  }
}
