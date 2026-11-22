import { IPositionRule } from "../types/entity-types";
import { IPosition } from "../types/external-data-types";
import PositionsRepository from "../shared/services/repos/positions-repository";
import { SchwabAPI } from "../shared/services/trading-api";
import { TradeLogger } from "../shared/utilities/trade-logger";
import { AccountType } from "../shared/enums";
import { Twilio } from "twilio";

export interface IQuote {
  symbol: string;
  bidPrice: number;
  askPrice: number;
  lastPrice: number;
}

type ExitReasonType = "STOP_LOSS" | "TARGET";

interface IPendingExitState {
  orderId: string;
  ruleId: number;
  symbol: string;
  normalizedSymbol: string;
  optionOrderSymbol?: string;
  accountType: AccountType;
  isOption: boolean;
  orderInstruction: "SELL" | "BUY_TO_COVER" | "SELL_TO_CLOSE" | "BUY_TO_CLOSE";
  attemptCount: number;
  pendingQuantity: number;
  alertSent: boolean;
  exitReasonType: ExitReasonType;
}

/**
 * Position Risk Monitor Service
 *
 * Monitors position rules and automatically exits positions when thresholds are met.
 * Also performs periodic cleanup of stale rules (rules for positions no longer held).
 */
export class PositionRiskMonitor {
  // Tracks pending exits and serves as the duplicate guard per account/symbol.
  private static pendingExits: Map<string, IPendingExitState> = new Map();
  private static readonly PENDING_EXIT_MONITOR_INTERVAL_MS = 20000;
  private static pendingExitMonitorInterval: NodeJS.Timeout | null = null;
  private static pendingExitTickInProgress = false;

  private static normalizeSymbol(symbol: string): string {
    return symbol.replace(/ /g, "").trim().toUpperCase();
  }

  private static extractUnderlyingFromOptionSymbol(symbol: string): string | null {
    const normalized = this.normalizeSymbol(symbol);
    const match = normalized.match(/^([A-Z]+)(\d{6}[CP]\d{8})$/);
    return match ? match[1] : null;
  }

  private static async resolveOptionContractQuote(symbol: string): Promise<IQuote | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const underlying = this.extractUnderlyingFromOptionSymbol(normalizedSymbol);
    if (!underlying) {
      return null;
    }

    try {
      const optionChain = await SchwabAPI.getOptionsChains(underlying, 40);
      const maps = [optionChain?.callExpDateMap, optionChain?.putExpDateMap];

      for (const expMap of maps) {
        for (const strikeMap of Object.values(expMap ?? {})) {
          for (const contracts of Object.values(strikeMap ?? {})) {
            if (!Array.isArray(contracts)) {
              continue;
            }

            const contract = contracts.find(
              (c) => this.normalizeSymbol(c.symbol) === normalizedSymbol,
            );
            if (!contract) {
              continue;
            }

            const bidPrice = Number.isFinite(contract.bid) ? contract.bid : 0;
            const askPrice = Number.isFinite(contract.ask) ? contract.ask : 0;
            const midpoint = (bidPrice + askPrice) / 2;

            return {
              symbol: normalizedSymbol,
              bidPrice,
              askPrice,
              lastPrice: Number.isFinite(midpoint) ? midpoint : 0,
            };
          }
        }
      }
    } catch (err) {
      TradeLogger.log(
        `[PositionRiskMonitor] Error resolving option quote from chain for ${normalizedSymbol}: ${String(err)}`,
      );
    }

    return null;
  }

  private static toQuote(
    symbol: string,
    quote: { bidPrice?: number; askPrice?: number; lastPrice?: number },
  ): IQuote | null {
    const bidPrice =
      typeof quote.bidPrice === "number" && Number.isFinite(quote.bidPrice)
        ? quote.bidPrice
        : 0;
    const askPrice =
      typeof quote.askPrice === "number" && Number.isFinite(quote.askPrice)
        ? quote.askPrice
        : 0;
    const lastPrice =
      typeof quote.lastPrice === "number" && Number.isFinite(quote.lastPrice)
        ? quote.lastPrice
        : bidPrice && askPrice
          ? (bidPrice + askPrice) / 2
          : 0;

    if (!bidPrice && !askPrice && !lastPrice) {
      return null;
    }

    return {
      symbol: this.normalizeSymbol(symbol),
      bidPrice: bidPrice || lastPrice,
      askPrice: askPrice || lastPrice,
      lastPrice,
    };
  }

  private static async resolveQuoteForSymbol(
    symbol: string,
    quoteMap: Map<string, IQuote>,
  ): Promise<IQuote | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const existing = quoteMap.get(normalizedSymbol);
    if (existing) {
      return existing;
    }

    try {
      const quoteData = await SchwabAPI.getStockDataMultiple(normalizedSymbol);
      for (const [key, value] of Object.entries(quoteData)) {
        if (!value?.quote) {
          continue;
        }
        if (this.normalizeSymbol(key) !== normalizedSymbol) {
          continue;
        }

        const normalizedQuote = this.toQuote(normalizedSymbol, value.quote as {
          bidPrice?: number;
          askPrice?: number;
          lastPrice?: number;
        });

        if (normalizedQuote) {
          quoteMap.set(normalizedSymbol, normalizedQuote);
          return normalizedQuote;
        }
      }
    } catch (err) {
      TradeLogger.log(
        `[PositionRiskMonitor] Error fetching quote for ${normalizedSymbol}: ${String(err)}`,
      );
    }

    const fallbackOptionQuote = await this.resolveOptionContractQuote(normalizedSymbol);
    if (fallbackOptionQuote) {
      quoteMap.set(normalizedSymbol, fallbackOptionQuote);
      return fallbackOptionQuote;
    }

    return null;
  }

  private static async resolveOptionOrderSymbol(symbol: string): Promise<string> {
    const normalized = this.normalizeSymbol(symbol);
    const underlying = this.extractUnderlyingFromOptionSymbol(normalized);
    if (!underlying) {
      return symbol;
    }

    try {
      const optionChain = await SchwabAPI.getOptionsChains(underlying, 40);
      const maps = [optionChain?.callExpDateMap, optionChain?.putExpDateMap];

      for (const expMap of maps) {
        for (const strikeMap of Object.values(expMap ?? {})) {
          for (const contracts of Object.values(strikeMap ?? {})) {
            if (!Array.isArray(contracts)) {
              continue;
            }

            const contract = contracts.find(
              (c) => this.normalizeSymbol(c.symbol) === normalized,
            );
            if (contract?.symbol) {
              return contract.symbol;
            }
          }
        }
      }
    } catch (err) {
      TradeLogger.log(
        `[PositionRiskMonitor] Error resolving option order symbol for ${normalized}: ${String(err)}`,
      );
    }

    const match = normalized.match(/^([A-Z]+)(\d{6}[CP]\d{8})$/);
    if (!match) {
      return symbol;
    }
    return `${match[1]} ${match[2]}`;
  }

  private static getPendingKey(accountType: AccountType, symbol: string): string {
    return `${accountType}:${this.normalizeSymbol(symbol)}`;
  }

  private static parseOrderId(value: unknown, fallback: string): string {
    if (typeof value !== "string" || value.length === 0) {
      return fallback;
    }

    const lastSlash = value.lastIndexOf("/");
    return lastSlash >= 0 ? value.substring(lastSlash + 1) : value;
  }

  private static toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private static getRemainingQuantity(orderData: unknown, fallback: number): number {
    const order = orderData as { remainingQuantity?: unknown; quantity?: unknown };
    const remaining = this.toFiniteNumber(order?.remainingQuantity);
    if (remaining != null && remaining >= 0) {
      return remaining;
    }

    const quantity = this.toFiniteNumber(order?.quantity);
    if (quantity != null && quantity >= 0) {
      return quantity;
    }

    return fallback;
  }

  private static isTerminalStatus(status: string): boolean {
    return ["CANCELED", "CANCELLED", "REJECTED", "EXPIRED"].includes(status);
  }

  private static computeReplacementPrice(quote: IQuote, weightTowardAsk: number): number {
    const bid = quote.bidPrice > 0 ? quote.bidPrice : quote.lastPrice;
    const ask = quote.askPrice > 0 ? quote.askPrice : quote.lastPrice;

    if (bid <= 0 && ask <= 0) {
      return 0;
    }
    if (bid <= 0) {
      return Number(ask.toFixed(2));
    }
    if (ask <= 0) {
      return Number(bid.toFixed(2));
    }

    return Number((bid + weightTowardAsk * (ask - bid)).toFixed(2));
  }

  private static ensurePendingExitMonitorRunning(): void {
    if (this.pendingExitMonitorInterval) {
      return;
    }

    this.pendingExitMonitorInterval = setInterval(() => {
      void this.monitorPendingExits();
    }, this.PENDING_EXIT_MONITOR_INTERVAL_MS);

    TradeLogger.log(
      `[PositionRiskMonitor] Started pending exit monitor (every ${this.PENDING_EXIT_MONITOR_INTERVAL_MS / 1000}s)`,
    );
  }

  private static stopPendingExitMonitorIfIdle(): void {
    if (this.pendingExits.size > 0 || !this.pendingExitMonitorInterval) {
      return;
    }

    clearInterval(this.pendingExitMonitorInterval);
    this.pendingExitMonitorInterval = null;
    TradeLogger.log("[PositionRiskMonitor] Stopped pending exit monitor (no pending exits)");
  }

  private static async sendPendingExitAlert(state: IPendingExitState): Promise<void> {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NOTIFY_SMS_TO } =
      process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !NOTIFY_SMS_TO) {
      TradeLogger.log(
        `[PositionRiskMonitor] Twilio alert skipped for ${state.symbol}: missing SMS environment configuration`,
      );
      return;
    }

    const message =
      `[PositionRiskMonitor] ${state.exitReasonType} exit still pending after retries for ${state.symbol} ` +
      `(${state.accountType}). Order ${state.orderId}, remaining quantity ${state.pendingQuantity}. ` +
      "No further replacement orders will be submitted.";

    try {
      const client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: message,
        from: TWILIO_FROM_NUMBER,
        to: NOTIFY_SMS_TO,
      });
    } catch (err) {
      TradeLogger.log(
        `[PositionRiskMonitor] Failed to send pending exit alert for ${state.symbol}: ${String(err)}`,
      );
    }
  }

  private static async monitorPendingExits(): Promise<void> {
    if (this.pendingExitTickInProgress) {
      TradeLogger.log("[PositionRiskMonitor] Pending exit monitor tick skipped (already running)");
      return;
    }

    if (this.pendingExits.size === 0) {
      this.stopPendingExitMonitorIfIdle();
      return;
    }

    this.pendingExitTickInProgress = true;
    try {
      for (const [pendingKey, state] of Array.from(this.pendingExits.entries())) {
        await this.processPendingExit(pendingKey, state);
      }
    } finally {
      this.pendingExitTickInProgress = false;
      this.stopPendingExitMonitorIfIdle();
    }
  }

  private static async processPendingExit(
    pendingKey: string,
    state: IPendingExitState,
  ): Promise<void> {
    try {
      const orderData = await SchwabAPI.getOrder(state.orderId, state.accountType);
      const status = String((orderData as { status?: string })?.status ?? "").toUpperCase();
      const remainingQuantity = this.getRemainingQuantity(orderData, state.pendingQuantity);
      state.pendingQuantity = remainingQuantity;

      TradeLogger.log(
        `[PositionRiskMonitor] Pending exit status ${state.symbol} (${state.accountType}) order=${state.orderId} status=${status || "UNKNOWN"} remaining=${remainingQuantity}`,
      );

      if (status === "FILLED" || remainingQuantity <= 0) {
        await PositionsRepository.deactivateRuleAfterExit(state.ruleId);
        this.pendingExits.delete(pendingKey);
        TradeLogger.log(
          `[PositionRiskMonitor] Pending exit filled for ${state.symbol}. Rule deactivated and pending entry removed`,
        );
        return;
      }

      if (this.isTerminalStatus(status)) {
        this.pendingExits.delete(pendingKey);
        TradeLogger.log(
          `[PositionRiskMonitor] Pending exit terminated for ${state.symbol} with status ${status}. Pending entry removed`,
        );
        return;
      }

      if (state.attemptCount >= 2) {
        if (!state.alertSent) {
          await this.sendPendingExitAlert(state);
          state.alertSent = true;
          this.pendingExits.set(pendingKey, state);
          TradeLogger.log(
            `[PositionRiskMonitor] Alert sent for ${state.symbol}. Leaving current order unchanged`,
          );
        }
        return;
      }

      const quote = await this.resolveQuoteForSymbol(state.normalizedSymbol, new Map());
      if (!quote) {
        TradeLogger.log(
          `[PositionRiskMonitor] Cannot reprice pending exit for ${state.symbol}: no quote available`,
        );
        return;
      }

      const replacementWeight = state.attemptCount === 0 ? 0.6 : 0.7;
      const replacementPrice = this.computeReplacementPrice(quote, replacementWeight);
      if (replacementPrice <= 0) {
        TradeLogger.log(
          `[PositionRiskMonitor] Skipping replacement for ${state.symbol}: invalid replacement price`,
        );
        return;
      }

      if (remainingQuantity <= 0) {
        return;
      }

      let latestOrderId = state.orderId;
      if (state.isOption) {
        const optionOrderSymbol = await this.resolveOptionOrderSymbol(state.symbol);
        await SchwabAPI.cancelOrder(state.orderId, state.accountType);
        latestOrderId = await SchwabAPI.placeOrder(
          {
            symbol: optionOrderSymbol,
            orderType: state.orderInstruction,
            marketOrder: false,
            shares: remainingQuantity,
            price: replacementPrice,
            option: true,
          },
          state.accountType,
        );
        state.optionOrderSymbol = optionOrderSymbol;
      } else {
        const replaceResponse = await SchwabAPI.replaceOrder(
          state.orderId,
          state.symbol,
          replacementPrice,
          state.orderInstruction,
          remainingQuantity,
          state.accountType,
        );
        latestOrderId = this.parseOrderId(replaceResponse, state.orderId);
      }

      state.orderId = latestOrderId;
      state.attemptCount += 1;
      this.pendingExits.set(pendingKey, state);
      TradeLogger.log(
        `[PositionRiskMonitor] Repriced pending exit for ${state.symbol} to ${replacementPrice.toFixed(2)} using ${Math.round(replacementWeight * 100)}% toward ask (attempt ${state.attemptCount})`,
      );
    } catch (err) {
      TradeLogger.log(
        `[PositionRiskMonitor] Error processing pending exit ${state.symbol}: ${String(err)}`,
      );
    }
  }

  /**
   * Run the monitoring cycle for a given account.
   * This should be called periodically (e.g., every 1-2 minutes during market hours).
   */
  static async runMonitorCycle(
    accountType: AccountType = AccountType.TRADING,
  ): Promise<void> {
    try {
      TradeLogger.log(
        `[PositionRiskMonitor] Starting cycle for account: ${accountType}`,
      );

      // Step 1: Clean up stale rules
      await this.cleanupStaleRules(accountType);

      // Step 2: Fetch active rules
      const activeRules = await PositionsRepository.getActiveRulesByAccount(accountType);
      if (activeRules.length === 0) {
        TradeLogger.log(`[PositionRiskMonitor] No active rules for ${accountType}`);
        return;
      }

      TradeLogger.log(`[PositionRiskMonitor] Found ${activeRules.length} active rules`);

      // Step 3: Fetch current brokerage positions
      const positions = await SchwabAPI.getAccountPositions(accountType);
      const positionsMap = new Map<string, IPosition>();
      if (positions && Array.isArray(positions)) {
        for (const pos of positions) {
          const symbol = this.normalizeSymbol(pos.instrument.symbol);
          positionsMap.set(symbol, pos);
        }
      }

      TradeLogger.log(`[PositionRiskMonitor] Found ${positionsMap.size} open positions`);

      // Step 4: Get unique symbols from rules
      const symbols = Array.from(new Set(activeRules.map((r) => this.normalizeSymbol(r.symbol))));

      // Step 5: Fetch quote data for all symbols
      let quotes: IQuote[] = [];
      if (symbols.length > 0) {
        try {
          const quoteData = await SchwabAPI.getStockDataMultiple(symbols.join(","));

          const quotesByNormalizedSymbol = new Map<string, IQuote>();
          for (const [key, value] of Object.entries(quoteData)) {
            if (!value?.quote) {
              continue;
            }

            const normalizedQuote = this.toQuote(this.normalizeSymbol(key), value.quote as {
              bidPrice?: number;
              askPrice?: number;
              lastPrice?: number;
            });
            if (normalizedQuote) {
              quotesByNormalizedSymbol.set(this.normalizeSymbol(key), normalizedQuote);
            }
          }

          quotes = symbols
            .map((symbol) => quotesByNormalizedSymbol.get(this.normalizeSymbol(symbol)) ?? null)
            .filter((q): q is IQuote => q !== null);
        } catch (err) {
          TradeLogger.log(`[PositionRiskMonitor] Error fetching quotes: ${String(err)}`);
          // Continue anyway with empty quotes
        }
      }

      const quoteMap = new Map<string, IQuote>();
      for (const quote of quotes) {
        quoteMap.set(quote.symbol, quote);
      }

      // Step 6: Evaluate rules and execute exits
      for (const rule of activeRules) {
        await this.evaluateAndExecuteRule(rule, quoteMap, positionsMap, accountType);
      }

      TradeLogger.log(`[PositionRiskMonitor] Cycle complete for ${accountType}`);
    } catch (err) {
      TradeLogger.log(`[PositionRiskMonitor] Error in monitor cycle: ${String(err)}`);
    }
  }

  /**
   * Evaluate a single rule and execute exit if threshold is hit
   */
  private static async evaluateAndExecuteRule(
    rule: IPositionRule,
    quoteMap: Map<string, IQuote>,
    positionsMap: Map<string, IPosition>,
    accountType: AccountType,
  ): Promise<void> {
    const pendingKey = this.getPendingKey(accountType, rule.symbol);
    const normalizedRuleSymbol = this.normalizeSymbol(rule.symbol);

    // Skip if already pending exit
    if (this.pendingExits.get(pendingKey)) {
      TradeLogger.log(`[PositionRiskMonitor] Pending exit for ${pendingKey}, skipping`);
      return;
    }

    // Check if position still exists
    const position = positionsMap.get(normalizedRuleSymbol);
    if (!position) {
      TradeLogger.log(
        `[PositionRiskMonitor] Position no longer exists for ${rule.symbol}, will be cleaned up in next cycle`,
      );
      return;
    }

    const quote = await this.resolveQuoteForSymbol(normalizedRuleSymbol, quoteMap);

    if (!quote) {
      TradeLogger.log(`[PositionRiskMonitor] No quote available for ${rule.symbol}`);
      return;
    }

    // Calculate midpoint
    const lastPrice = quote.lastPrice;

    // Evaluate thresholds
    let shouldExit = false;
    let exitReason = "";
    let exitReasonType: ExitReasonType | null = null;

    // Check instrument threshold
    if (rule.stop_loss && lastPrice <= rule.stop_loss) {
      shouldExit = true;
      exitReason = `stop loss (${rule.stop_loss})`;
      exitReasonType = "STOP_LOSS";
    } else if (rule.target && lastPrice >= rule.target) {
      shouldExit = true;
      exitReason = `target (${rule.target})`;
      exitReasonType = "TARGET";
    }

    // Check underlying threshold for options
    if (rule.option && !shouldExit) {
      const underlyingSymbol = this.extractUnderlyingFromOptionSymbol(normalizedRuleSymbol);
      if (
        underlyingSymbol &&
        (rule.stop_loss_on_underlying != null || rule.target_on_underlying != null)
      ) {
        const underlyingQuote = await this.resolveQuoteForSymbol(underlyingSymbol, quoteMap);

        if (!underlyingQuote) {
          TradeLogger.log(
            `[PositionRiskMonitor] No underlying quote available for ${rule.symbol} (${underlyingSymbol})`,
          );
        } else {
          const underlyingLastPrice = underlyingQuote.lastPrice;

          if (
            rule.stop_loss_on_underlying != null &&
            underlyingLastPrice <= rule.stop_loss_on_underlying
          ) {
            shouldExit = true;
            exitReason =
              `underlying stop loss (${rule.stop_loss_on_underlying}) for ${underlyingSymbol}`;
            exitReasonType = "STOP_LOSS";
          } else if (
            rule.target_on_underlying != null &&
            underlyingLastPrice >= rule.target_on_underlying
          ) {
            shouldExit = true;
            exitReason =
              `underlying target (${rule.target_on_underlying}) for ${underlyingSymbol}`;
            exitReasonType = "TARGET";
          }
        }
      }
    }

    if (shouldExit && exitReasonType) {
      TradeLogger.log(
        `[PositionRiskMonitor] Threshold hit for ${rule.symbol}: ${exitReason}, executing exit...`,
      );

      try {
        // Submit initial limit exit order and begin pending-order lifecycle.
        const quantity = position.longQuantity || position.shortQuantity || 0;
        if (quantity === 0) {
          TradeLogger.log(
            `[PositionRiskMonitor] No quantity to exit for ${rule.symbol}`,
          );
          return;
        }

        // Determine order type based on position
        const isShort = position.shortQuantity && position.shortQuantity > 0;
        const isCall = rule.symbol.includes("C");
        const isPut = rule.symbol.includes("P");
        const isOption = Boolean(rule.option || isCall || isPut);
        const limitPrice = this.computeReplacementPrice(quote, 0.6);

        if (limitPrice <= 0) {
          TradeLogger.log(
            `[PositionRiskMonitor] Unable to compute valid limit price for ${rule.symbol}, skipping exit`,
          );
          return;
        }

        let orderId = "";
        let orderInstruction: "SELL" | "BUY_TO_COVER" | "SELL_TO_CLOSE" | "BUY_TO_CLOSE";
        let optionOrderSymbol: string | undefined;

        if (isOption) {
          // Options must be submitted with OPTION payload and close instructions.
          const optionInstruction = isShort ? "BUY_TO_CLOSE" : "SELL_TO_CLOSE";
          optionOrderSymbol = await this.resolveOptionOrderSymbol(rule.symbol);
          orderId = await SchwabAPI.placeOrder(
            {
              symbol: optionOrderSymbol,
              orderType: optionInstruction,
              marketOrder: false,
              shares: quantity,
              price: limitPrice,
              option: true,
            },
            accountType,
          );
          orderInstruction = optionInstruction;
        } else {
          // For equities: sell if long, buy to cover if short
          if (isShort) {
            orderId = await SchwabAPI.buyToCoverStock(
              rule.symbol,
              limitPrice,
              quantity,
              true,
              accountType,
            );
            orderInstruction = "BUY_TO_COVER";
          } else {
            orderId = await SchwabAPI.sellStock(
              rule.symbol,
              limitPrice,
              quantity,
              true,
              accountType,
            );
            orderInstruction = "SELL";
          }
        }

        this.pendingExits.set(pendingKey, {
          orderId,
          ruleId: rule.id,
          symbol: rule.symbol,
          normalizedSymbol: normalizedRuleSymbol,
          optionOrderSymbol,
          accountType,
          isOption,
          orderInstruction,
          attemptCount: 0,
          pendingQuantity: quantity,
          alertSent: false,
          exitReasonType,
        });

        this.ensurePendingExitMonitorRunning();

        TradeLogger.log(
          `[PositionRiskMonitor] Initial ${exitReasonType} exit order placed for ${rule.symbol} at ${limitPrice.toFixed(2)}. Monitoring pending status in 20-second loop`,
        );
      } catch (err) {
        TradeLogger.log(
          `[PositionRiskMonitor] Error executing exit for ${rule.symbol}: ${String(err)}`,
        );
        this.pendingExits.delete(pendingKey);
      }
    }
  }

  /**
   * Clean up stale rules for symbols no longer in open positions
   */
  private static async cleanupStaleRules(accountType: AccountType): Promise<void> {
    try {
      // Fetch all active rules
      const activeRules = await PositionsRepository.getActiveRulesByAccount(accountType);
      if (activeRules.length === 0) {
        return;
      }

      // Fetch current brokerage positions
      const positions = await SchwabAPI.getAccountPositions(accountType);
      const openSymbols = new Set<string>();
      if (positions && Array.isArray(positions)) {
        for (const pos of positions) {
          const symbol = pos.instrument.symbol.replace(/ /g, "");
          openSymbols.add(symbol);
        }
      }

      // Find rules for symbols no longer in positions
      const staleRules = activeRules.filter(
        (rule) => !openSymbols.has(this.normalizeSymbol(rule.symbol)),
      );

      if (staleRules.length > 0) {
        TradeLogger.log(
          `[PositionRiskMonitor] Found ${staleRules.length} stale rules for ${accountType}, cleaning up...`,
        );

        // Delete stale rules
        for (const rule of staleRules) {
          try {
            await PositionsRepository.deleteRule(rule.id);
            TradeLogger.log(`[PositionRiskMonitor] Deleted stale rule for ${rule.symbol}`);
          } catch (err) {
            TradeLogger.log(
              `[PositionRiskMonitor] Error deleting stale rule for ${rule.symbol}: ${String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      TradeLogger.log(`[PositionRiskMonitor] Error in cleanup: ${String(err)}`);
    }
  }

  /**
   * Start monitoring for all accounts (trading and regular)
   */
  static async startMonitoring(): Promise<void> {
    TradeLogger.log("[PositionRiskMonitor] Starting monitoring service");

    const accounts: AccountType[] = [AccountType.TRADING, AccountType.REGULAR];
    for (const account of accounts) {
      try {
        await this.runMonitorCycle(account);
      } catch (err) {
        TradeLogger.log(
          `[PositionRiskMonitor] Error for account ${account}: ${String(err)}`,
        );
      }
    }
  }
}
