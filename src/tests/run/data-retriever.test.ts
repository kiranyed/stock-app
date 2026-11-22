import { PeriodType } from "../../shared/constants";
import { DataRetriever } from "../../run/data-retriever";
import { SchwabAPI } from "../../shared/services/trading-api";
import { SchwabDataMap } from "../../types/external-data-types";

jest.mock("../../shared/services/trading-api");

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
      (SchwabAPI.getStockData as jest.Mock).mockResolvedValue(mockData);
      (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue(mockData);

      const mockAllStocks = { [PeriodType.DAY]: ["AAPL"] };
      const result = await DataRetriever.getData(
        [PeriodType.DAY],
        mockAllStocks,
      );

      expect(SchwabAPI.getStockDataMultiple).toHaveBeenCalledWith(
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
      const mockData: SchwabDataMap = {
        [mockStock]: {
          symbol: mockStock,
          quote: {
            highPrice: 0,
            lowPrice: 0,
            lastPrice: 150,
            totalVolume: 123456789,
          },
        },
      };
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
      (SchwabAPI.getStockData as jest.Mock).mockResolvedValue(mockData);

      const result = DataRetriever.getDataBackTest(123422, mockCandleData);

      expect(result).toEqual([
        {
          high: 0,
          low: 0,
          open: 0,
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

      (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue(mockData);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabAPI.getStockDataMultiple).toHaveBeenCalledWith(
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
      const retrievalSpy = jest
        .spyOn(
          DataRetriever as unknown as {
            getRetrievalParams: () => {
              retrievalIntervalTime: number;
              increment: number;
              isReal: boolean;
            };
          },
          "getRetrievalParams",
        )
        .mockReturnValue({
          retrievalIntervalTime: 1000,
          increment: 5,
          isReal: false,
        });
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
      (SchwabAPI.getStockDataMultiple as jest.Mock)
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabAPI.getStockDataMultiple).toHaveBeenNthCalledWith(
        1,
        "AAPL,GOOGL,MSFT,TSLA,NVDA",
      );
      expect(SchwabAPI.getStockDataMultiple).toHaveBeenNthCalledWith(2, "META");
      expect(result.find((item) => item.symbol === "AAPL")?.price).toBe(150);
      expect(result.find((item) => item.symbol === "META")?.price).toBe(500);
      retrievalSpy.mockRestore();
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

      (SchwabAPI.getStockDataMultiple as jest.Mock).mockResolvedValue(mockData);

      const result = await DataRetriever.getDataInIntervals(
        [PeriodType.DAY],
        mockStocks,
      );

      expect(SchwabAPI.getStockDataMultiple).toHaveBeenCalledTimes(1);
      expect(SchwabAPI.getStockDataMultiple).toHaveBeenCalledWith("IWM");
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
