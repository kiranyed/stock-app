import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { SchwabAPI } from "../shared/services/trading-api";
import { IOrder, Contract, IPosition } from "../types/external-data-types";
import StockInfoRepository from "../shared/services/repos/stock-info-repository";
import PositionsRepository from "../shared/services/repos/positions-repository";
import {
  IStockInfoEntity,
  IPositionRule,
  IPositionRuleNew,
} from "../types/entity-types";
import Error400 from "../errors/error-400";
import { accountTypeCheck } from "../middleware/shared-funcs";

const router = express.Router();

type QuoteLike = {
  lastPrice?: number;
  mark?: number;
  bidPrice?: number;
  askPrice?: number;
};

const getQuotePrice = (quote?: QuoteLike): number | null => {
  if (!quote) {
    return null;
  }

  if (typeof quote.lastPrice === "number" && Number.isFinite(quote.lastPrice)) {
    return quote.lastPrice;
  }

  if (typeof quote.mark === "number" && Number.isFinite(quote.mark)) {
    return quote.mark;
  }

  if (
    typeof quote.bidPrice === "number" &&
    Number.isFinite(quote.bidPrice) &&
    typeof quote.askPrice === "number" &&
    Number.isFinite(quote.askPrice)
  ) {
    return (quote.bidPrice + quote.askPrice) / 2;
  }

  return null;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value == null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getPlacementErrorMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Failed to place order";
};

const validatePositionRule = async (rule: IPositionRuleNew) => {
  const normalizedSymbol = rule.symbol.replace(/ /g, "").trim().toUpperCase();
  const optionMatch = normalizedSymbol.match(/^([A-Z]+)(\d{6}[CP]\d{8})$/);
  const isOption = Boolean(optionMatch);
  const underlyingSymbol = isOption ? optionMatch![1] : null;

  let positionPrice: number | null;

  if (isOption && underlyingSymbol) {
    // Resolve price from options chain by finding the matching contract
    const optionChain = await SchwabAPI.getOptionsChains(underlyingSymbol, 40);
    if (!optionChain?.callExpDateMap && !optionChain?.putExpDateMap) {
      throw new Error400(`Unable to fetch options chain for ${underlyingSymbol}`);
    }

    const normalizeContractSymbol = (s: string) => s.replace(/ /g, "").toUpperCase();
    const maps = [optionChain.callExpDateMap, optionChain.putExpDateMap];

    let foundContract: Contract | undefined;
    outer: for (const expMap of maps) {
      for (const strikeMap of Object.values(expMap ?? {})) {
        for (const contracts of Object.values(strikeMap ?? {})) {
          if (!Array.isArray(contracts)) {
            continue;
          }
          const match = contracts.find(
            (c) => normalizeContractSymbol(c.symbol) === normalizedSymbol,
          );
          if (match) {
            foundContract = match;
            break outer;
          }
        }
      }
    }

    if (!foundContract) {
      throw new Error400(`Unable to find option contract ${normalizedSymbol} in the chain`);
    }

    const mid = (foundContract.bid + foundContract.ask) / 2;
    positionPrice = Number.isFinite(mid) && mid > 0 ? mid : null;
  } else {
    // Stock: look up via getStockDataMultiple
    const quoteResponse = await SchwabAPI.getStockDataMultiple(normalizedSymbol);
    const normalizeKey = (value: string) => value.replace(/ /g, "").toUpperCase();

    let resolvedQuote: QuoteLike | undefined = quoteResponse[normalizedSymbol]?.quote as QuoteLike | undefined;
    if (!resolvedQuote) {
      const match = Object.entries(quoteResponse).find(([key, val]) => {
        if (!val?.quote) {
          return false;
        }
        return normalizeKey(key) === normalizedSymbol;
      });
      resolvedQuote = match?.[1]?.quote as QuoteLike | undefined;
    }
    positionPrice = getQuotePrice(resolvedQuote);
  }

  if (positionPrice == null) {
    throw new Error400(`Unable to determine current price for ${normalizedSymbol}`);
  }

  if (rule.stop_loss != null && rule.stop_loss >= positionPrice) {
    throw new Error400("stopLoss must be less than the current price");
  }

  if (rule.target != null && rule.target <= positionPrice) {
    throw new Error400("target must be above the current price");
  }

  if (isOption && (rule.stop_loss_on_underlying != null || rule.target_on_underlying != null)) {
    if (!underlyingSymbol) {
      throw new Error400("Unable to determine underlying symbol for option rule");
    }

    const underlyingQuoteResponse = await SchwabAPI.getStockDataMultiple(underlyingSymbol);
    const underlyingQuote = getQuotePrice(
      underlyingQuoteResponse[underlyingSymbol]?.quote as QuoteLike | undefined,
    );

    if (underlyingQuote == null) {
      throw new Error400(`Unable to determine current price for ${underlyingSymbol}`);
    }

    if (
      rule.stop_loss_on_underlying != null &&
      rule.stop_loss_on_underlying >= underlyingQuote
    ) {
      throw new Error400("stopLossOnUnderlying must be less than the underlying stock price");
    }

    if (
      rule.target_on_underlying != null &&
      rule.target_on_underlying <= underlyingQuote
    ) {
      throw new Error400("targetOnUnderlying must be above the underlying stock price");
    }
  }
};

const OPTION_TIME_FRAMES = [
  "weeklies",
  "shortTerm",
  "midTerm",
  "longTerm",
  "leaps",
] as const;

const OPTION_STRIKE_TYPES = ["deepItm", "itm", "atm", "otm", "deepOtm"] as const;

type OptionTimeFrame = (typeof OPTION_TIME_FRAMES)[number];
type OptionStrikeType = (typeof OPTION_STRIKE_TYPES)[number];

type OptionSelection = {
  timeFrame: OptionTimeFrame;
  strikeType: OptionStrikeType;
};

type ResolvedOptionContract = {
  selection: OptionSelection;
  expirationDate: string;
  contract: Contract;
  midpoint: number;
  contractPrice: number;
  quantity: number;
};

type OptionChainContractSummary = {
  symbol: string;
  strikePrice: number;
  bid: number;
  ask: number;
  mark: number;
};

type OptionChainExpirationSummary = {
  expirationDate: string;
  daysToExpiration: number;
  calls: OptionChainContractSummary[];
  puts: OptionChainContractSummary[];
};

const TIMEFRAME_OFFSETS: Record<OptionTimeFrame, number> = {
  weeklies: 1296000000,
  shortTerm: 5184000000,
  midTerm: 15552000000,
  longTerm: 31536000000,
  leaps: 63072000000, // ~2 years — targets Jan LEAPS two cycles out
};

const MIN_BID_ASK_RATIO = 0.7;

const toContractSummary = (contract: Contract): OptionChainContractSummary => {
  const mark = (contract.bid + contract.ask) / 2;
  return {
    symbol: contract.symbol,
    strikePrice: contract.strikePrice,
    bid: contract.bid,
    ask: contract.ask,
    mark: parseFloat(mark.toFixed(4)),
  };
};

const getDaysToExpirationFromKey = (key: string): number => {
  const suffix = key.split(":")[1];
  const parsed = Number(suffix);
  return Number.isFinite(parsed) ? parsed : 0;
};

const flattenExpirationContracts = (
  map: Record<string, Record<string, Contract[]>>,
): Record<string, OptionChainExpirationSummary> => {
  const expirations: Record<string, OptionChainExpirationSummary> = {};

  for (const [expKey, strikesMap] of Object.entries(map ?? {})) {
    const expirationDate = expKey.substring(0, 10);
    const existing = expirations[expirationDate] ?? {
      expirationDate,
      daysToExpiration: getDaysToExpirationFromKey(expKey),
      calls: [],
      puts: [],
    };

    for (const contracts of Object.values(strikesMap ?? {})) {
      if (!Array.isArray(contracts)) {
        continue;
      }
      for (const contract of contracts) {
        if (!contract?.symbol) {
          continue;
        }
        existing.calls.push(toContractSummary(contract));
      }
    }

    expirations[expirationDate] = existing;
  }

  return expirations;
};

const buildOptionsChainSummary = (
  callExpDateMap: Record<string, Record<string, Contract[]>>,
  putExpDateMap: Record<string, Record<string, Contract[]>>,
): OptionChainExpirationSummary[] => {
  const callsByExpiration = flattenExpirationContracts(callExpDateMap);
  const putsByExpiration = flattenExpirationContracts(putExpDateMap);

  const allDates = new Set<string>([
    ...Object.keys(callsByExpiration),
    ...Object.keys(putsByExpiration),
  ]);

  const expirations = Array.from(allDates).map((dateKey) => {
    const callsSummary = callsByExpiration[dateKey];
    const putsSummary = putsByExpiration[dateKey];

    const calls = (callsSummary?.calls ?? []).sort(
      (a, b) => a.strikePrice - b.strikePrice,
    );
    const puts = (putsSummary?.calls ?? []).sort(
      (a, b) => a.strikePrice - b.strikePrice,
    );

    return {
      expirationDate: dateKey,
      daysToExpiration:
        callsSummary?.daysToExpiration ?? putsSummary?.daysToExpiration ?? 0,
      calls,
      puts,
    };
  });

  expirations.sort((a, b) => {
    const aTime = new Date(a.expirationDate).getTime();
    const bTime = new Date(b.expirationDate).getTime();
    return aTime - bTime;
  });

  return expirations;
};

const resolveContractBySymbol = (
  optionChain: {
    callExpDateMap: Record<string, Record<string, Contract[]>>;
    putExpDateMap: Record<string, Record<string, Contract[]>>;
  },
  contractSymbol: string,
): { contract: Contract; expirationDate: string } => {
  const maps = [optionChain.callExpDateMap, optionChain.putExpDateMap];

  for (const expMap of maps) {
    for (const [expKey, strikeMap] of Object.entries(expMap ?? {})) {
      for (const contracts of Object.values(strikeMap ?? {})) {
        if (!Array.isArray(contracts)) {
          continue;
        }
        const match = contracts.find((contract) => contract.symbol === contractSymbol);
        if (match) {
          return { contract: match, expirationDate: expKey.substring(0, 10) };
        }
      }
    }
  }

  throw new Error400(`Selected contract ${contractSymbol} was not found in the options chain`);
};

const toValidTimeFrame = (value: unknown): OptionTimeFrame | null => {
  if (typeof value !== "string") {
    return null;
  }
  return (OPTION_TIME_FRAMES as readonly string[]).includes(value)
    ? (value as OptionTimeFrame)
    : null;
};

const toValidStrikeType = (value: unknown): OptionStrikeType | null => {
  if (typeof value !== "string") {
    return null;
  }
  return (OPTION_STRIKE_TYPES as readonly string[]).includes(value)
    ? (value as OptionStrikeType)
    : null;
};

const parseOptionSelections = (body: Record<string, unknown>): OptionSelection[] => {
  const selections: OptionSelection[] = [];

  const selectedTimeFrame = toValidTimeFrame(body.optionLength);
  const selectedStrikeType = toValidStrikeType(body.optionAggressiveness);
  if (selectedTimeFrame && selectedStrikeType) {
    selections.push({ timeFrame: selectedTimeFrame, strikeType: selectedStrikeType });
  }

  for (const timeFrame of OPTION_TIME_FRAMES) {
    const values = body[timeFrame];
    if (!Array.isArray(values)) {
      continue;
    }
    for (const val of values) {
      const strikeType = toValidStrikeType(val);
      if (strikeType) {
        selections.push({ timeFrame, strikeType });
      }
    }
  }

  const unique = new Map<string, OptionSelection>();
  for (const selection of selections) {
    unique.set(`${selection.timeFrame}:${selection.strikeType}`, selection);
  }
  return Array.from(unique.values());
};

const getClosestExpirationDateKey = (
  callExpDateMap: Record<string, Record<string, Contract[]>>,
  timeFrame: OptionTimeFrame,
): string => {
  const rawDateKeys = Object.keys(callExpDateMap);
  if (!rawDateKeys.length) {
    throw new Error400("No option contracts are available for this ticker");
  }

  const targetDate = Date.now() + TIMEFRAME_OFFSETS[timeFrame];
  let closestKey = "";
  let closestDiff = Number.POSITIVE_INFINITY;

  for (const key of rawDateKeys) {
    const dateOnly = key.substring(0, 10);
    const dateMillis = new Date(dateOnly).getTime();
    if (!Number.isFinite(dateMillis)) {
      continue;
    }
    const diff = Math.abs(targetDate - dateMillis);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestKey = key;
    }
  }

  if (!closestKey) {
    throw new Error400(`No expiration contracts found for ${timeFrame}`);
  }

  return closestKey;
};

const getDeepOtmIndex = (contractsArr: Contract[][], atmIdx: number): number => {
  for (let idx = contractsArr.length - 1; idx > atmIdx; idx -= 1) {
    const contract = contractsArr[idx]?.[0];
    if (!contract) {
      continue;
    }
    const ratio = contract.ask ? contract.bid / contract.ask : 0;
    if (ratio >= MIN_BID_ASK_RATIO) {
      return idx;
    }
  }

  return -1;
};

const resolveContractForSelection = (
  contractsByStrike: Record<string, Contract[]>,
  underlyingPrice: number,
  selection: OptionSelection,
): Contract => {
  const sortedStrikeKeys = Object.keys(contractsByStrike).sort(
    (a, b) => parseFloat(a) - parseFloat(b),
  );

  if (!sortedStrikeKeys.length) {
    throw new Error400("No option strikes are available for the selected expiration");
  }

  const contractsArr = sortedStrikeKeys
    .map((key) => contractsByStrike[key])
    .filter((contract) => Array.isArray(contract) && contract.length > 0);

  if (!contractsArr.length) {
    throw new Error400("No option strikes are available for the selected expiration");
  }

  let atmIdx = 0;
  let minDiff = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx < contractsArr.length; idx += 1) {
    const strike = contractsArr[idx][0]?.strikePrice;
    if (typeof strike !== "number") {
      continue;
    }
    const diff = Math.abs(underlyingPrice - strike);
    if (diff < minDiff) {
      minDiff = diff;
      atmIdx = idx;
    }
  }

  const deepOtmIdx = getDeepOtmIndex(contractsArr, atmIdx);

  let selectedIdx: number;
  switch (selection.strikeType) {
    case "deepItm":
      selectedIdx = Math.max(0, atmIdx - 10);
      break;
    case "itm":
      selectedIdx = Math.max(0, atmIdx - 5);
      break;
    case "atm":
      selectedIdx = atmIdx;
      break;
    case "otm":
      if (deepOtmIdx === -1) {
        throw new Error400("No OTM option with sufficient liquidity was found");
      }
      selectedIdx = Math.floor((atmIdx + deepOtmIdx) / 2);
      break;
    case "deepOtm":
      if (deepOtmIdx === -1) {
        throw new Error400("No deep OTM option with sufficient liquidity was found");
      }
      selectedIdx = deepOtmIdx;
      break;
    default:
      selectedIdx = atmIdx;
  }

  const selectedContract = contractsArr[selectedIdx]?.[0];
  if (!selectedContract) {
    throw new Error400("Unable to determine option contract for the selected strategy");
  }

  return selectedContract;
};

const resolveOptionContracts = async (
  symbol: string,
  dollars: number,
  selections: OptionSelection[],
  opts?: { allowZeroQuantity?: boolean },
): Promise<ResolvedOptionContract[]> => {
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error400("dollars must be greater than 0");
  }

  const normalizedSymbol = symbol.replace(/ /g, "").trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error400("symbol is required");
  }

  const optionChain = await SchwabAPI.getOptionsChains(normalizedSymbol, 40);
  if (!optionChain?.callExpDateMap || !Object.keys(optionChain.callExpDateMap).length) {
    throw new Error400(`No option chain was found for ${normalizedSymbol}`);
  }

  const underlyingPrice = optionChain.underlyingPrice;
  if (!Number.isFinite(underlyingPrice)) {
    throw new Error400(`Unable to determine underlying price for ${normalizedSymbol}`);
  }

  const dollarAmountPerPosition = dollars / selections.length;
  const resolvedContracts: ResolvedOptionContract[] = [];

  for (const selection of selections) {
    const expirationDateKey = getClosestExpirationDateKey(
      optionChain.callExpDateMap,
      selection.timeFrame,
    );
    const contractsByStrike = optionChain.callExpDateMap[expirationDateKey];
    const contract = resolveContractForSelection(
      contractsByStrike,
      underlyingPrice,
      selection,
    );

    const midpoint = (contract.bid + contract.ask) / 2;
    const contractPrice = parseFloat((100 * midpoint).toFixed(2));

    if (!Number.isFinite(contractPrice) || contractPrice <= 0) {
      throw new Error400("Unable to determine contract price for selected option");
    }

    const quantity = Math.floor(dollarAmountPerPosition / contractPrice);
    if (quantity <= 0 && !opts?.allowZeroQuantity) {
      throw new Error400(
        `Dollar amount is too small for ${selection.strikeType} ${selection.timeFrame} contracts`,
      );
    }

    resolvedContracts.push({
      selection,
      expirationDate: expirationDateKey.substring(0, 10),
      contract,
      midpoint: parseFloat(midpoint.toFixed(4)),
      contractPrice,
      quantity,
    });
  }

  return resolvedContracts;
};

// const makeOrderWithStopLoss = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { order } = req.body;
//         const { accountType } = req.query;        let accountTypeParam = undefined;
//         if (accountType) {
//             accountTypeCheck(accountType);
//             accountTypeParam = accountType;
//         }
//         const orderId = await SchwabAPI.placeOrder(order, accountTypeParam);
//         res.status(StatusCodes.CREATED).json({ orderId: order.data.orderId });
//     } catch (err) {
//         return next(err);
//     }
// }

const makeOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body;
    const { accountType } = req.query;
    let accountTypeParam = undefined;
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }

    const orderList = (orders as IOrder[]) ?? [];
    const results: Array<{
      index: number;
      symbol: string;
      orderId?: string;
      status: "accepted" | "failed";
      error?: string;
    }> = [];

    for (const [index, order] of orderList.entries()) {
      try {
        const orderId = await SchwabAPI.placeOrder(order, accountTypeParam);
        results.push({
          index,
          symbol: order.symbol,
          orderId,
          status: "accepted",
        });
      } catch (err) {
        results.push({
          index,
          symbol: order.symbol,
          status: "failed",
          error: getPlacementErrorMessage(err),
        });
      }
    }

    const accepted = results.filter((result) => result.status === "accepted");
    const failed = results.filter((result) => result.status === "failed");

    if (!accepted.length) {
      throw new Error400(
        failed[0]?.error ?? "No orders were accepted by Schwab",
      );
    }

    res.status(StatusCodes.CREATED).json({
      message:
        failed.length > 0
          ? `Placed ${accepted.length} order(s); ${failed.length} failed`
          : `Placed ${accepted.length} order(s)`,
      acceptedCount: accepted.length,
      failedCount: failed.length,
      orderIds: accepted
        .map((result) => result.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
      results,
    });
  } catch (err) {
    return next(err);
  }
};

const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountType, startTime, endTime, status } = req.query;
    let startTimeNumber, endTimeNumber;
    let accountTypeParam = undefined;
    if (startTime && endTime) {
      if (typeof startTime !== "string" || typeof endTime !== "string") {
        throw new Error400("status, startTime and endTime are invalid");
      }
      startTimeNumber = parseFloat(startTime);
      endTimeNumber = parseFloat(endTime);
    }
    if (typeof status !== "string") {
      if (status) {
        throw new Error400("status must be a string");
      }
    }
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }
    const orders = await SchwabAPI.getOrders(
      typeof status === "string" ? status : undefined,
      startTimeNumber
        ? { start: startTimeNumber, end: endTimeNumber }
        : undefined,
      accountTypeParam,
    );
    res.status(StatusCodes.OK).json({ orders });
  } catch (err) {
    return next(err);
  }
};

const getAccountPositions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { accountType } = req.query;
    let accountTypeParam = undefined;
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }

    const positions = await SchwabAPI.getAccountPositions(accountTypeParam);
    if (!positions) {
      return res.status(StatusCodes.OK).json({ positions: [] });
    }
    const symbols = positions.map((position) =>
      position.instrument.symbol.replace(/ /g, ""),
    );

    const symbolsNoOptions = symbols
      .map((symbol) => {
        const match = symbol.match(/^[A-Za-z]+/);
        return match ? match[0] : "";
      })
      .filter((symbols) => symbols !== "");
    const quotes = await SchwabAPI.getStocks(symbols);
    const info = await StockInfoRepository.getStockInfo(symbolsNoOptions);
    const infoMap: { [key: string]: IStockInfoEntity } = info.reduce(
      (prevVal, curVal) => ({ ...prevVal, [curVal.symbol]: curVal }),
      {},
    );
    for (let stock of quotes) {
      const symbol = stock.symbol.match(/^[A-Za-z]+/)?.[0];
      if (!symbol) {
        continue;
      }
      stock = { ...stock, ...infoMap[symbol] };
    }
    const positionsMap: { [key: string]: IPosition } = positions.reduce(
      (prevVal, curVal) => ({
        ...prevVal,
        [curVal.instrument.symbol.replace(/ /g, "")]: { ...curVal },
      }),
      {},
    );
    const newQuotes = quotes.map((stock) => ({
      ...stock,
      labels: infoMap[stock.symbol.match(/^[A-Za-z]+/)?.[0] ?? ""]?.labels,
    }));
    for (const quote of newQuotes) {
      positionsMap[quote.symbol] = { ...positionsMap[quote.symbol], ...quote };
    }

    // 🆕 Fetch position rules and merge them into positions
    const accountTypeValue = accountTypeParam || "trading";
    const positionRules = await PositionsRepository.getActiveRulesByAccount(
      accountTypeValue,
    );
    const rulesMap: Record<string, IPositionRule> = {};
    for (const rule of positionRules) {
      const normalizedSymbol = rule.symbol.replace(/ /g, "").toUpperCase();
      rulesMap[normalizedSymbol] = rule;

      // Backward-compatible aliases for older option-key formats
      if (rule.option) {
        const normalizedOption = String(rule.option).replace(/ /g, "").toUpperCase();
        rulesMap[`${normalizedSymbol}_${normalizedOption}`] = rule;
        rulesMap[`${normalizedSymbol}_${String(rule.option).toUpperCase()}`] = rule;
      }
    }

    res.status(StatusCodes.OK).json({
      positions: positions.map((position) => {
        const posSymbol = position.instrument.symbol.replace(/ /g, "").toUpperCase();
        const matchedRule =
          rulesMap[posSymbol] ??
          rulesMap[`${posSymbol}_${posSymbol}`] ??
          rulesMap[`${posSymbol}_TRUE`];

        const merged = {
          ...positionsMap[posSymbol],
          ...(matchedRule && {
            stopLoss: toOptionalNumber(matchedRule.stop_loss),
            stopLossOnUnderlying: toOptionalNumber(
              matchedRule.stop_loss_on_underlying,
            ),
            target: toOptionalNumber(matchedRule.target),
            targetOnUnderlying: toOptionalNumber(
              matchedRule.target_on_underlying,
            ),
            positionRuleId: matchedRule.id,
          }),
        };
        return merged;
      }),
    });
  } catch (err) {
    return next(err);
  }
};

const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountType, orderId } = req.query;
    let accountTypeParam = undefined;
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }
    if (typeof orderId !== "string") {
      throw new Error400("orderId is invalid");
    }

    await SchwabAPI.cancelOrder(orderId, accountTypeParam);
    res.status(StatusCodes.OK).json({ message: "success" });
  } catch (err) {
    return next(err);
  }
};

// const getOptionsOrder = (symbol) => {
//     SchwabAPI.getOptionsChains(symbol)
//     .then(data => {
//         const atmStrike = parseFloat(data.underlyingPrice.toFixed(1));
//         const calls = data.callExpDateMap;
//         const oneMonthOut = calls[Date.now() + 2592000000];

//     })
// }

const getQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbolRaw = req.query.symbol;
    if (typeof symbolRaw !== "string") {
      throw new Error400("symbol is required");
    }

    const rawSymbol = symbolRaw.trim().toUpperCase();
    const normalizedSymbol = rawSymbol.replace(/ /g, "");
    if (!normalizedSymbol) {
      throw new Error400("symbol is required");
    }

    const optionMatch = normalizedSymbol.match(/^([A-Z]+)(\d{6}[CP]\d{8})$/);
    const withOccSpace = optionMatch
      ? `${optionMatch[1]} ${optionMatch[2]}`
      : normalizedSymbol;

    const candidateSymbols = Array.from(
      new Set([rawSymbol, normalizedSymbol, withOccSpace].filter(Boolean)),
    );

    const quoteData = await SchwabAPI.getStockDataMultiple(candidateSymbols.join(","));
    const normalizeKey = (value: string) => value.replace(/ /g, "").toUpperCase();

    let resolvedQuote: unknown;
    let resolvedSymbol = normalizedSymbol;
    let resolvedDescription: string | null = null;

    for (const candidate of candidateSymbols) {
      const entry = quoteData[candidate];
      if (entry?.quote) {
        resolvedQuote = entry.quote;
        resolvedSymbol = candidate;
        resolvedDescription = (entry as unknown as { reference?: { description?: string } }).reference?.description ?? null;
        break;
      }
    }

    if (!resolvedQuote) {
      const dataEntries = Object.entries(quoteData);
      const normalizedCandidates = new Set(candidateSymbols.map(normalizeKey));
      const match = dataEntries.find(([key, val]) => {
        if (!val?.quote) {
          return false;
        }
        return normalizedCandidates.has(normalizeKey(key));
      });
      if (match) {
        resolvedQuote = match[1].quote;
        resolvedSymbol = match[0];
        resolvedDescription = (match[1] as unknown as { reference?: { description?: string } }).reference?.description ?? null;
      }
    }

    if (!resolvedQuote) {
      throw new Error400(`No quote data found for ${normalizedSymbol}`);
    }

    const quoteLike = resolvedQuote as QuoteLike;
    const bid = typeof quoteLike.bidPrice === "number" ? quoteLike.bidPrice : null;
    const ask = typeof quoteLike.askPrice === "number" ? quoteLike.askPrice : null;
    const mark = typeof quoteLike.mark === "number" ? quoteLike.mark : null;
    const last = typeof quoteLike.lastPrice === "number" ? quoteLike.lastPrice : null;

    res.status(StatusCodes.OK).json({
      symbol: resolvedSymbol,
      description: resolvedDescription,
      bid,
      ask,
      mark,
      last,
      quoteTime: Date.now(),
    });
  } catch (err) {
    return next(err);
  }
};

const previewOptionsTrade = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body as Record<string, unknown>;
    const symbol = typeof body.symbol === "string" ? body.symbol : "";
    const quantity = Number(body.quantity);
    const selections = parseOptionSelections(body);

    if (!symbol.trim()) {
      throw new Error400("symbol is required");
    }

    if (!selections.length) {
      throw new Error400(
        "Select option aggressiveness and expiration before requesting a preview",
      );
    }

    const previewQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
    const resolvedContracts = await resolveOptionContracts(symbol, 0, selections, {
      allowZeroQuantity: true,
    });
    const firstContract = resolvedContracts[0];
    const estimatedTotal = parseFloat((previewQuantity * firstContract.contractPrice).toFixed(2));

    res.status(StatusCodes.OK).json({
      symbol: symbol.replace(/ /g, "").trim().toUpperCase(),
      selection: firstContract.selection,
      contractSymbol: firstContract.contract.symbol,
      strikePrice: firstContract.contract.strikePrice,
      expirationDate: firstContract.expirationDate,
      bid: firstContract.contract.bid,
      ask: firstContract.contract.ask,
      midpoint: firstContract.midpoint,
      contractPrice: firstContract.contractPrice,
      estimatedQuantity: previewQuantity,
      estimatedTotal,
    });
  } catch (err) {
    return next(err);
  }
};

const getOptionsChain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbolRaw = req.query.symbol;
    if (typeof symbolRaw !== "string") {
      throw new Error400("symbol is required");
    }

    const symbol = symbolRaw.replace(/ /g, "").trim().toUpperCase();
    if (!symbol) {
      throw new Error400("symbol is required");
    }

    const optionChain = await SchwabAPI.getOptionsChains(symbol, 200);
    if (
      !optionChain ||
      (!Object.keys(optionChain.callExpDateMap ?? {}).length &&
        !Object.keys(optionChain.putExpDateMap ?? {}).length)
    ) {
      throw new Error400(`No option chain was found for ${symbol}`);
    }

    const expirations = buildOptionsChainSummary(
      optionChain.callExpDateMap as Record<string, Record<string, Contract[]>>,
      optionChain.putExpDateMap as Record<string, Record<string, Contract[]>>,
    );

    res.status(StatusCodes.OK).json({
      symbol,
      underlyingPrice: optionChain.underlyingPrice,
      expirations,
    });
  } catch (err) {
    return next(err);
  }
};

const optionsTrade = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>;
    const { accountType } = req.query;

    let accountTypeParam = undefined;
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }

    const symbol = typeof body.symbol === "string" ? body.symbol : "";
    const quantity = Number(body.quantity);
    const limitPrice = Number(body.limitPrice);
    const marketOrder = Boolean(body.marketOrder);
    const selections = parseOptionSelections(body);
    const manualContractSymbol =
      typeof body.contractSymbol === "string" ? body.contractSymbol.trim() : "";

    if (!symbol.trim()) {
      throw new Error400("symbol is required");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error400("quantity must be greater than 0");
    }

    if (!marketOrder && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
      throw new Error400("limitPrice must be greater than 0 for limit orders");
    }

    if (!selections.length && !manualContractSymbol) {
      throw new Error400(
        "At least one option aggressiveness/expiration combination must be selected",
      );
    }

    let resolvedContracts: ResolvedOptionContract[];
    const parsedQuantity = Math.floor(quantity);

    if (manualContractSymbol) {
      const optionChain = await SchwabAPI.getOptionsChains(
        symbol.replace(/ /g, "").trim().toUpperCase(),
        200,
      );
      const resolvedManual = resolveContractBySymbol(
        {
          callExpDateMap: optionChain.callExpDateMap as Record<string, Record<string, Contract[]>>,
          putExpDateMap: optionChain.putExpDateMap as Record<string, Record<string, Contract[]>>,
        },
        manualContractSymbol,
      );
      const midpoint = (resolvedManual.contract.bid + resolvedManual.contract.ask) / 2;
      const contractPrice = Number.isFinite(limitPrice) && limitPrice > 0
        ? limitPrice
        : parseFloat((100 * midpoint).toFixed(2));

      resolvedContracts = [
        {
          selection: {
            timeFrame: "weeklies",
            strikeType: "atm",
          },
          expirationDate: resolvedManual.expirationDate,
          contract: resolvedManual.contract,
          midpoint: parseFloat(midpoint.toFixed(4)),
          contractPrice,
          quantity: parsedQuantity,
        },
      ];
    } else {
      const suggestedContracts = await resolveOptionContracts(symbol, 0, selections, {
        allowZeroQuantity: true,
      });
      resolvedContracts = suggestedContracts.map((resolved) => ({
        ...resolved,
        quantity: parsedQuantity,
        contractPrice:
          Number.isFinite(limitPrice) && limitPrice > 0
            ? limitPrice
            : resolved.contractPrice,
      }));
    }
    const results: Array<{
      symbol: string;
      strikeType: string;
      timeFrame: string;
      expirationDate: string;
      quantity: number;
      orderId?: string;
      status: "accepted" | "failed";
      error?: string;
    }> = [];

    for (const resolved of resolvedContracts) {
      try {
        const orderId = await SchwabAPI.placeOrder(
          {
            symbol: resolved.contract.symbol,
            orderType: "BUY_TO_OPEN",
            marketOrder,
            shares: resolved.quantity,
            price: marketOrder ? 0 : resolved.contractPrice,
            option: true,
          },
          accountTypeParam,
        );

        results.push({
          symbol: resolved.contract.symbol,
          strikeType: resolved.selection.strikeType,
          timeFrame: resolved.selection.timeFrame,
          expirationDate: resolved.expirationDate,
          quantity: resolved.quantity,
          orderId,
          status: "accepted",
        });
      } catch (err) {
        results.push({
          symbol: resolved.contract.symbol,
          strikeType: resolved.selection.strikeType,
          timeFrame: resolved.selection.timeFrame,
          expirationDate: resolved.expirationDate,
          quantity: resolved.quantity,
          status: "failed",
          error: getPlacementErrorMessage(err),
        });
      }
    }

    const accepted = results.filter((result) => result.status === "accepted");
    const failed = results.filter((result) => result.status === "failed");

    if (!accepted.length) {
      throw new Error400(
        failed[0]?.error ?? "No options orders were accepted by Schwab",
      );
    }

    res.status(StatusCodes.CREATED).json({
      message:
        failed.length > 0
          ? `Placed ${accepted.length} options order(s); ${failed.length} failed`
          : `Placed ${accepted.length} options order(s)`,
      acceptedCount: accepted.length,
      failedCount: failed.length,
      orderIds: accepted
        .map((result) => result.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
      contracts: results.map((result) => ({
        symbol: result.symbol,
        strikeType: result.strikeType,
        timeFrame: result.timeFrame,
        expirationDate: result.expirationDate,
        quantity: result.quantity,
        orderId: result.orderId,
        status: result.status,
        error: result.error,
      })),
    });
  } catch (err) {
    return next(err);
  }
};

const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { symbol, startDate, endDate, accountType } = req.query;
    let accountTypeParam = undefined;
    if (accountType) {
      accountTypeCheck(accountType);
      accountTypeParam = accountType;
    }
    if (
      typeof symbol !== "string" ||
      typeof startDate !== "string" ||
      typeof endDate !== "string"
    ) {
      throw new Error400("symbol, startDate or endDate is invalid");
    }
    const transactions = await SchwabAPI.getTransactionHistory(
      symbol,
      startDate,
      endDate,
      accountTypeParam,
    );
    res.status(StatusCodes.OK).json(transactions);
  } catch (err) {
    return next(err);
  }
};

// Register routes
router.post("/make-orders", makeOrders);
router.get("/orders", getOrders);
router.get("/acct-positions", getAccountPositions);
router.delete("/cancel-order", cancelOrder);
router.get("/quote", getQuote);
router.get("/options-chain", getOptionsChain);
router.post("/options-preview", previewOptionsTrade);
router.post("/options-trade", optionsTrade);
router.get("/transactions", getTransactions);

// 🆕 Position rule endpoints
const updatePositionRule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { accountType } = req.query;
    const rule: IPositionRuleNew = req.body;

    if (!accountType || typeof accountType !== "string") {
      throw new Error400("accountType is required");
    }
    accountTypeCheck(accountType);

    if (!rule.symbol) {
      throw new Error400("symbol is required");
    }

    await validatePositionRule(rule);

    const ruleWithAccount = { ...rule, account_type: accountType };
    await PositionsRepository.upsert(ruleWithAccount);

    res.status(StatusCodes.CREATED).json({
      message: "Position rule created/updated successfully",
    });
  } catch (err) {
    return next(err);
  }
};

const deletePositionRule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { ruleId } = req.query;

    if (!ruleId || typeof ruleId !== "string") {
      throw new Error400("ruleId is required");
    }

    const id = parseInt(ruleId, 10);
    if (isNaN(id)) {
      throw new Error400("ruleId must be a valid number");
    }

    await PositionsRepository.deleteRule(id);

    res.status(StatusCodes.OK).json({
      message: "Position rule deleted successfully",
    });
  } catch (err) {
    return next(err);
  }
};

router.patch("/position-rule", updatePositionRule);
router.delete("/position-rule", deletePositionRule);
export {
  makeOrders,
  getOrders,
  getAccountPositions,
  cancelOrder,
  getQuote,
  getOptionsChain,
  previewOptionsTrade,
  optionsTrade,
  getTransactions,
  updatePositionRule,
  deletePositionRule,
};
export default router;
