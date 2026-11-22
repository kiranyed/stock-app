import { DataRetriever } from "../../run/data-retriever";
import StockGroupMapper from "../../mappers/stock-group-mapper";
import { MAX_STOCK_QUOTES_PER_REQUEST, PeriodType } from "../../shared/constants";
import { DatabaseAPI } from "../../shared/services/db-api";
import { SchwabAPI } from "../../shared/services/trading-api";
import { IStockGroupEntity } from "../../types/entity-types";

type IStockGroupRow = Omit<IStockGroupEntity, "symbols"> & {
  symbols: unknown;
};

describe("Integration - DataRetriever", () => {
  let schwabReady = false;

  beforeAll(async () => {
    await DatabaseAPI.createConnection();

    try {
      await SchwabAPI.initialize();
      await SchwabAPI.testAccessToken();
      schwabReady = true;
    } catch {
      schwabReady = false;
    }
  });

  afterAll(async () => {
    if (DatabaseAPI.connectionExists()) {
      await DatabaseAPI.closeConnection();
    }
  });

  it("normalizes live Schwab quote data returned for multiple symbols", async () => {
    if (!schwabReady) {
      console.warn(
        "Skipping data retriever integration test: Schwab auth unavailable.",
      );
      return;
    }

    const symbols = ["AAPL", "MSFT"];
    const getStockDataMultiple = SchwabAPI.getStockDataMultiple.bind(SchwabAPI);
    const schwabSpy = jest
      .spyOn(SchwabAPI, "getStockDataMultiple")
      .mockImplementation((stockNames: string) => getStockDataMultiple(stockNames));

    try {
      const result = await DataRetriever.getData(
        [PeriodType.DAY],
        { [PeriodType.DAY]: symbols },
      );
      const rawQuotes = await schwabSpy.mock.results[0].value;

      expect(schwabSpy).toHaveBeenCalledWith(symbols.join(","));
      expect(result).toHaveLength(symbols.length);

      for (const symbol of symbols) {
        const quote = rawQuotes[symbol]?.quote;
        const normalized = result.find((item) => item.symbol === symbol);

        expect(quote).toBeDefined();
        expect(normalized).toBeDefined();
        expect(normalized?.price).toBe(quote?.lastPrice);
        expect(normalized?.volume).toBe(quote?.totalVolume);
        expect(normalized?.datetime).toEqual(expect.any(Number));
      }
    } finally {
      schwabSpy.mockRestore();
    }
  }, 30000);

  it("retrieves the database-backed IWM group and records whether Schwab rate limits any quote batch", async () => {
    if (!schwabReady) {
      console.warn(
        "Skipping IWM data retriever integration test: Schwab auth unavailable.",
      );
      return;
    }

    const [group] = await DatabaseAPI.runQuery<IStockGroupRow>(
      "select * from stock_group where name='IWM' order by json_length(symbols) desc limit 1",
    );

    expect(group).toBeTruthy();

    const symbols = StockGroupMapper.parseSymbols(group.symbols);
    const expectedBatchCount = Math.ceil(
      symbols.length / MAX_STOCK_QUOTES_PER_REQUEST,
    );
    const getStockDataMultiple = SchwabAPI.getStockDataMultiple.bind(SchwabAPI);
    const rateLimitStatuses: number[] = [];
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const schwabSpy = jest
      .spyOn(SchwabAPI, "getStockDataMultiple")
      .mockImplementation(async (stockNames: string) => {
        try {
          return await getStockDataMultiple(stockNames);
        } catch (error: unknown) {
          const status =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof error.response === "object" &&
            error.response !== null &&
            "status" in error.response &&
            typeof error.response.status === "number"
              ? error.response.status
              : undefined;

          if (status === 429) {
            rateLimitStatuses.push(status);
          }

          throw error;
        }
      });

    try {
      expect(symbols.length).toBeGreaterThan(MAX_STOCK_QUOTES_PER_REQUEST);

      const result = await DataRetriever.getData(
        [PeriodType.DAY],
        { [PeriodType.DAY]: symbols },
      );

      expect(schwabSpy).toHaveBeenCalledTimes(expectedBatchCount);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(symbols.length);

      if (rateLimitStatuses.length > 0) {
        expect(result.length).toBeLessThan(symbols.length);
      }

      console.log("IWM group Schwab retrieval summary", {
        groupId: group.id,
        symbolCount: symbols.length,
        expectedBatchCount,
        retrievedQuoteCount: result.length,
        rateLimitCount: rateLimitStatuses.length,
        rateLimited: rateLimitStatuses.length > 0,
      });
    } finally {
      schwabSpy.mockRestore();
      errorSpy.mockRestore();
    }
  }, 120000);
});