import { PeriodType } from "../../shared/constants";
import { DataRetriever } from "../../run/data-retriever";
import { SchwabClient } from "../../providers/schwab/schwab-client";
import { SchwabMarketData } from "../../providers/schwab/schwab-market-data";
import { SchwabDataMap } from "../../types/external-data-types";
import * as MarketData from "../../providers/market-data";

jest.mock("../../providers/schwab/schwab-client");

describe("DataRetriever", () => {
  const defaultDateTimeStamp = 1609459200000;
  const totalVolume = 123456789;
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    // Mock Date.now() to return a fixed value
    jest.spyOn(Date, "now").mockImplementation(() => defaultDateTimeStamp); // Example timestamp
  });

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore the original implementation of Date.now()
    (Date.now as jest.Mock).mockRestore();
  });
  describe("getData", () => {
    it("should get data", async () => {
      const mockData: SchwabDataMap = {
        AAPL: {
          symbol: "AAPL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 150, totalVolume },
        },
      };
      (SchwabClient.getQuotes as jest.Mock).mockResolvedValue(mockData);

      const mockAllStocks = { [PeriodType.DAY]: ["AAPL"] };
      const result = await DataRetriever.getData(
        [PeriodType.DAY],
        mockAllStocks,
      );

      expect(SchwabClient.getQuotes).toHaveBeenCalledWith(
        mockAllStocks[PeriodType.DAY].join(","),
      );
      expect(result).toEqual([
        {
          symbol: "AAPL",
          totalVolume,
          volume: totalVolume,
          price: 150,
          datetime: defaultDateTimeStamp,
        },
      ]);
    });
  });

  describe("getDataBackTest", () => {
    it("should get data for back test", () => {
      const mockStock = "AAPL";
      const mockCandleData = {
        [mockStock]: {
          candles: [
            {
              symbol: mockStock,
              datetime: 123422,
              open: 11,
              close: 2,
              high: 0,
              low: 0,
              volume: 0,
            },
          ],
          index: 0,
          symbol: "AAPL",
          empty: false,
        },
      };

      const result = DataRetriever.getDataBackTest(123422, mockCandleData);

      expect(result).toEqual([
        {
          high: 0,
          low: 0,
          open: 11,
          close: 2,
          symbol: mockStock,
          price: 2,
          volume: 0,
          datetime: 123422,
        },
      ]);
    });
  });

  describe("getDataInIntervals", () => {
    it("should get data in intervals", async () => {
      const mockStocks = { [PeriodType.DAY]: ["AAPL", "GOOGL"] };
      const mockData: SchwabDataMap = {
        AAPL: {
          symbol: "AAPL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 150, totalVolume },
        },
        GOOGL: {
          symbol: "GOOGL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 2800, totalVolume },
        },
      };

      (SchwabClient.getQuotes as jest.Mock).mockResolvedValue(mockData);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabClient.getQuotes).toHaveBeenCalledWith(
        mockStocks[PeriodType.DAY].join(","),
      );
      expect(result).toEqual([
        {
          symbol: "AAPL",
          totalVolume,
          volume: totalVolume,
          price: 150,
          datetime: defaultDateTimeStamp,
        },
        {
          symbol: "GOOGL",
          price: 2800,
          totalVolume,
          volume: totalVolume,
          datetime: defaultDateTimeStamp,
        },
      ]);
    });

    it("should keep first quote when same symbol appears in later batches", async () => {
      const providerSpy = jest
        .spyOn(MarketData, "marketData")
        .mockReturnValue(new SchwabMarketData({ quoteBatchSize: 5, quoteBatchDelayMs: 0 }));
      const mockStocks = {
        [PeriodType.DAY]: ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "META"],
      };
      const firstBatch: SchwabDataMap = {
        AAPL: {
          symbol: "AAPL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 150, totalVolume },
        },
        GOOGL: {
          symbol: "GOOGL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 2800, totalVolume },
        },
        MSFT: {
          symbol: "MSFT",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 400, totalVolume },
        },
        TSLA: {
          symbol: "TSLA",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 200, totalVolume },
        },
        NVDA: {
          symbol: "NVDA",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 900, totalVolume },
        },
      };
      const secondBatch: SchwabDataMap = {
        AAPL: {
          symbol: "AAPL",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 999, totalVolume },
        },
        META: {
          symbol: "META",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 500, totalVolume },
        },
      };
      (SchwabClient.getQuotes as jest.Mock)
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabClient.getQuotes).toHaveBeenNthCalledWith(
        1,
        "AAPL,GOOGL,MSFT,TSLA,NVDA",
      );
      expect(SchwabClient.getQuotes).toHaveBeenNthCalledWith(2, "META");
      expect(result.find((item) => item.symbol === "AAPL")?.price).toBe(150);
      expect(result.find((item) => item.symbol === "META")?.price).toBe(500);
      providerSpy.mockRestore();
    });

    it("filters empty symbol entries before requesting Schwab quotes", async () => {
      const mockStocks = {
        [PeriodType.DAY]: ["IWM", "", "   ", "IWM"],
      };
      const mockData: SchwabDataMap = {
        IWM: {
          symbol: "IWM",
          quote: { highPrice: 0, lowPrice: 0, lastPrice: 210, totalVolume },
        },
      };

      (SchwabClient.getQuotes as jest.Mock).mockResolvedValue(mockData);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabClient.getQuotes).toHaveBeenCalledTimes(1);
      expect(SchwabClient.getQuotes).toHaveBeenCalledWith("IWM");
      expect(result).toEqual([
        {
          symbol: "IWM",
          totalVolume,
          volume: totalVolume,
          price: 210,
          datetime: defaultDateTimeStamp,
        },
      ]);
    });
  });
});
