import express, { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { MassCreateStrategies } from "../shared/utilities/mass-create-strategies";
import { CONSTANTS } from "../shared/constants";
import { DatabaseAPI } from "../shared/services/db-api";
import { EarningsUtil } from "../shared/utilities/earnings-util";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import { SchwabClient } from "../providers/schwab/schwab-client";
import Error400 from "../errors/error-400";

const router = express.Router();

type QuoteLike = {
  lastPrice?: number;
  mark?: number;
  bidPrice?: number;
  askPrice?: number;
};

const parseSymbolsValue = (symbols: unknown): string[] => {
  if (Array.isArray(symbols)) {
    return symbols.map(String).map((symbol) => symbol.trim()).filter(Boolean);
  }
  if (typeof symbols !== "string") {
    return [];
  }

  return symbols
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
};

const normalizeSymbolKey = (value: string) => value.replace(/ /g, "").toUpperCase();

const buildSymbolCandidates = (rawSymbol: string): string[] => {
  const normalizedSymbol = rawSymbol.replace(/ /g, "");
  const optionMatch = normalizedSymbol.match(/^([A-Z]+)(\d{6}[CP]\d{8})$/);
  const withOccSpace = optionMatch
    ? `${optionMatch[1]} ${optionMatch[2]}`
    : normalizedSymbol;

  return Array.from(new Set([rawSymbol, normalizedSymbol, withOccSpace].filter(Boolean)));
};

const resolveLastPrice = (quoteLike: QuoteLike | null): number | null => {
  if (!quoteLike) {
    return null;
  }

  if (typeof quoteLike.lastPrice === "number" && Number.isFinite(quoteLike.lastPrice)) {
    return quoteLike.lastPrice;
  }

  if (typeof quoteLike.mark === "number" && Number.isFinite(quoteLike.mark)) {
    return quoteLike.mark;
  }

  const hasBid = typeof quoteLike.bidPrice === "number" && Number.isFinite(quoteLike.bidPrice);
  const hasAsk = typeof quoteLike.askPrice === "number" && Number.isFinite(quoteLike.askPrice);

  if (hasBid && hasAsk) {
    return (quoteLike.bidPrice! + quoteLike.askPrice!) / 2;
  }

  if (hasBid) {
    return quoteLike.bidPrice!;
  }

  if (hasAsk) {
    return quoteLike.askPrice!;
  }

  return null;
};

const getQuotes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawSymbols = parseSymbolsValue(req.query.symbols);
    const symbols = Array.from(new Set(rawSymbols.map((symbol) => symbol.toUpperCase())));

    if (symbols.length === 0) {
      throw new Error400("At least one symbol is required");
    }

    const symbolsToQuery = Array.from(
      new Set(symbols.flatMap((symbol) => buildSymbolCandidates(symbol))),
    );

    const quoteData = await SchwabClient.getQuotes(symbolsToQuery.join(","));
    const quotes = symbols.reduce<Record<string, {
      requestedSymbol: string;
      symbol: string;
      description: string | null;
      lastPrice: number | null;
    }>>((acc, rawSymbol) => {
      const candidateSymbols = buildSymbolCandidates(rawSymbol);

      let resolvedSymbol = rawSymbol;
      let resolvedDescription: string | null = null;
      let resolvedQuote: QuoteLike | null = null;

      for (const candidate of candidateSymbols) {
        const entry = quoteData[candidate];
        if (entry?.quote) {
          resolvedQuote = entry.quote;
          resolvedSymbol = entry.symbol || candidate;
          resolvedDescription = entry.reference?.description ?? null;
          break;
        }
      }

      if (!resolvedQuote) {
        const normalizedCandidates = new Set(candidateSymbols.map(normalizeSymbolKey));
        const match = Object.entries(quoteData).find(([key, value]) => (
          Boolean(value?.quote) && normalizedCandidates.has(normalizeSymbolKey(key))
        ));

        if (match) {
          const [key, value] = match;
          resolvedQuote = value.quote;
          resolvedSymbol = value.symbol || key;
          resolvedDescription = value.reference?.description ?? null;
        }
      }

      acc[rawSymbol] = {
        requestedSymbol: rawSymbol,
        symbol: resolvedSymbol,
        description: resolvedDescription,
        lastPrice: resolveLastPrice(resolvedQuote),
      };

      return acc;
    }, {});

    res.status(StatusCodes.OK).json(quotes);
  } catch (error) {
    next(error);
  }
};

const storeEarningsList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const query = req.query;
  let arr: string[] = [];
  try {
    if (query.fileName && typeof query.fileName === "string") {
      EarningsUtil.createEarningsLists();
      arr = await EarningsUtil.parseHTMLFileFromFileName(query.fileName);
    } else if (query.day && typeof query.day === "string") {
      arr = await EarningsUtil.getEarningsCalendarStocks(parseInt(query.day));
    }
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.status(StatusCodes.OK).json({ symbols: arr });
  } catch (error) {
    next(error);
  }
};

const storeHistory = async (
  symbols: string,
  periodType: string,
  frequencyType: string,
  startTime: string,
  endTime: string,
) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const arr = symbols.split(",");
  const tableName =
    frequencyType === "minute"
      ? "HistoricalStockData"
      : "historicalstockdatadays";
  let index = 0;

  const interval = setInterval(async () => {
    try {
      const slicedArr = arr.slice(index, index + 50);
      const promises = slicedArr.map((item) =>
        SchwabClient.getPriceHistory(
          item,
          periodType,
          frequencyType,
          1,
          start,
          end,
        ),
      );
      const responses = await Promise.all(promises);

      let query = `INSERT IGNORE INTO ${tableName} (symbol, open, close, low, high, datetime, volume) VALUES `;
      const values = responses.flatMap(
        (response) =>
          response.candles?.map(
            (candle) =>
              `('${response.symbol}', ${candle.open}, ${candle.close}, ${candle.low}, ${candle.high}, ${candle.datetime}, ${candle.volume})`,
          ) || [],
      );
      query += values.join(", ");
      await DatabaseAPI.runQuery(query);
    } catch (err) {
      console.error(err);
    }

    index += 50;
    if (index >= arr.length) {
      clearInterval(interval);
    }
  }, 62000);
};

const storePriceHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { symbols, periodType, frequencyType, startTime, endTime } = req.body;
  try {
    await storeHistory(symbols, periodType, frequencyType, startTime, endTime);
    res.status(StatusCodes.OK).json({ symbols });
  } catch (error) {
    next(error);
  }
};

const massCreateStrategies = async (req: Request, res: Response) => {
  try {
    await MassCreateStrategies.setParams();
    res.status(StatusCodes.OK).json({ test: "yo" });
  } catch (error) {
    console.error(error);
  }
};

const storeAllNames = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const names = "can,SITM,BILL,..."; // Truncated for brevity
    const upper = names.toUpperCase();
    const arr = Array.from(
      new Set(upper.split(",").map((name) => name.trim())),
    );
    await DatabaseAPI.runQuery(
      `INSERT INTO properties (name, value) VALUES ('all_stocks', '${arr.join(",")}')`,
    );
    res.status(StatusCodes.OK).json({ test: "yo" });
  } catch (error) {
    next(error);
  }
};

const initDatabase = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await DatabaseAPI.createConnection();
    const arr = "nov11,nov18,nov25,dec2,dec9,feb3,feb10,feb17,feb24,mar2".split(
      ",",
    );
    const fileStrings = await Promise.all(
      arr.map((name) =>
        StockTradeUtil.readFile(`src/earnings-data/${name}earnings.txt`),
      ),
    );

    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      const monthString = entry.substring(0, 3);
      const day = entry.substring(3);
      const year = monthString === "nov" || monthString === "dec" ? 2019 : 2020;
      const date = new Date(`${monthString} ${day}, ${year}`);
      const millis = date.getTime();
      const earningsLists = fileStrings[i].split("\r\n");

      for (let j = 0; j < earningsLists.length; j++) {
        const stocks = earningsLists[j].split(",").map((stock) => `'${stock}'`);
        const earningsDate = new Date(millis + j * CONSTANTS.MILLIS_IN_DAY);
        const dateString = `'${earningsDate.getFullYear()}-${earningsDate.getMonth() + 1}-${earningsDate.getDate()}'`;

        for (const stock of stocks) {
          await DatabaseAPI.runQuery(
            `INSERT INTO historicalearningsstock (symbol, earningsdate) VALUES (${stock}, ${dateString})`,
          );
        }
      }
    }
    res.status(StatusCodes.OK).json({ test: "yo" });
  } catch (error) {
    next(error);
  }
};

// Register routes
router.get("/earnings-list", storeEarningsList);
router.post("/stock-history", storePriceHistory);
router.get("/quotes", getQuotes);
router.get("/mass-create-strategies", massCreateStrategies);
router.get("/store-all-names", storeAllNames);
router.get("/database-init", initDatabase);
export {
  storeEarningsList,
  storePriceHistory,
  getQuotes,
  massCreateStrategies,
  storeAllNames,
  initDatabase,
};
export default router;
