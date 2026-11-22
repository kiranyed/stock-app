import axios from "axios";
import { SchwabAPI } from "../../shared/services/trading-api";
import { AccountType } from "../../shared/enums";
import { DatabaseAPI } from "../../shared/services/db-api";
import * as dotenv from "dotenv";

jest.mock("axios");
jest.mock("../../shared/services/db-api");
jest.mock("../../shared/enums", () => ({
  AccountType: {
    TRADING: "TRADING",
    RETIREMENT: "RETIREMENT",
  },
}));

export interface IOrder {
  symbol: string;
  orderType: string;
  marketOrder: boolean;
  shares: number;
  price: number;
  option?: boolean;
}

const getMockOrder = (): IOrder => ({
  symbol: "AAPL",
  orderType: "BUY",
  marketOrder: false,
  shares: 10,
  price: 150,
});

const token = "";

const payload = {
  orderType: "LIMIT",
  session: "NORMAL",
  duration: "DAY",
  orderStrategyType: "SINGLE",
  price: "150",
  orderLegCollection: [
    {
      instruction: "BUY",
      quantity: 10,
      instrument: {
        symbol: "AAPL",
        assetType: "EQUITY",
      },
    },
  ],
};

const buyToCoverPayload = {
  orderType: "LIMIT",
  session: "NORMAL",
  duration: "DAY",
  orderStrategyType: "SINGLE",
  price: "150",
  orderLegCollection: [
    {
      instruction: "BUY_TO_COVER",
      quantity: 10,
      instrument: {
        symbol: "AAPL",
        assetType: "EQUITY",
      },
    },
  ],
};

const sellShortPayload = {
  orderType: "LIMIT",
  session: "NORMAL",
  duration: "DAY",
  orderStrategyType: "SINGLE",
  price: "150",
  orderLegCollection: [
    {
      instruction: "SELL_SHORT",
      quantity: 10,
      instrument: {
        symbol: "AAPL",
        assetType: "EQUITY",
      },
    },
  ],
};

const sellPayload = {
  orderType: "LIMIT",
  session: "NORMAL",
  duration: "DAY",
  orderStrategyType: "SINGLE",
  price: "150",
  orderLegCollection: [
    {
      instruction: "SELL",
      quantity: 10,
      instrument: {
        symbol: "AAPL",
        assetType: "EQUITY",
      },
    },
  ],
};

dotenv.config();

const { AWS_URL, TRADING_ACCOUNT_HASH, YAHOO_KEY } = process.env;
const schwabUrl = "https://api.schwabapi.com";
const schwabTraderApiUrl = `${schwabUrl}/trader/v1/accounts/${TRADING_ACCOUNT_HASH}`;
const schwabMarketDataUrl = `${schwabUrl}/marketdata/v1`;

describe("SchwabAPI", () => {
  let mockedAxios: jest.MockedFunction<typeof axios>;
  beforeAll(() => {
    mockedAxios = jest.mocked(axios);
    //mockedAxios = axios as jest.MockedFunction<typeof axios>
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clears all mock calls and instances
    jest.resetModules(); // Resets module cache
  });

  // afterEach(() => {
  //     jest.clearAllMocks();  // Clears all mock calls and instances
  //     jest.resetModules();    // Resets module cache
  // });

  // beforeEach(() => {
  //     jest.resetAllMocks(); // Ensures fresh mock state before each test
  //     mockedAxios = axios as jest.MockedFunction<typeof axios>
  // });

  describe("placeOrder", () => {
    it("should place an order and return the result", async () => {
      const mockResponse = { headers: { location: "/orderNumber" } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.placeOrder(getMockOrder());

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders`,
        data: payload,
        method: "post",
        headers: { Authorization: token },
        params: undefined,
      });
      expect(result).toEqual("orderNumber");
    });

    it("should throw an error if the order placement fails", async () => {
      const mockError = new Error("Order placement failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.placeOrder(getMockOrder())).rejects.toThrow(
        mockError,
      );
    });
  });

  describe("getAccountPositions", () => {
    it("should get account positions and return the result", async () => {
      const mockResponse = { data: { securitiesAccount: { positions: 3 } } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getAccountPositions();

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}`,
        method: "get",
        headers: { Authorization: token },
        params: { fields: "positions" },
      });
      expect(result).toEqual(3);
    });

    it("should throw an error if getting account positions fails", async () => {
      const mockError = new Error("Getting account positions failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getAccountPositions()).rejects.toThrow(mockError);
    });
  });

  describe("getPendingOrders", () => {
    it("should get pending orders and return the result", async () => {
      const mockResponse = { data: [{ orderId: "12345", status: "PENDING" }] };
      mockedAxios.mockResolvedValue(mockResponse);
      const range = {
        start: new Date("2023-01-01").toISOString(),
        end: new Date("2023-01-31").toISOString(),
      };
      const result = await SchwabAPI.getPendingOrders(range);

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        url: `${schwabTraderApiUrl}/orders`,
        method: "get",
        headers: { Authorization: token },
        params: {
          fromEnteredTime: range.start,
          toEnteredTime: range.end,
          status: "WORKING",
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting pending orders fails", async () => {
      const mockError = new Error("Getting pending orders failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getPendingOrders()).rejects.toThrow(mockError);
    });
  });

  describe("placeOptionsTrade", () => {
    it("should place an options trade and return the result", async () => {
      const mockQuantity = 10;
      const mockPrice = 6.45;

      const mockResponse = { data: { tradeId: "67890" } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.placeOptionsTrade(
        "FB_011924C330",
        mockPrice,
        "BUY",
        mockQuantity,
        AccountType.REGULAR,
      );

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders`,
        method: "post",
        headers: { Authorization: token },
        data: {
          orderType: "LIMIT",
          complexOrderStrategyType: "NONE",
          session: "NORMAL",
          duration: "DAY",
          orderStrategyType: "SINGLE",
          price: "" + mockPrice,
          orderLegCollection: [
            {
              instruction: "BUY_TO_OPEN",
              quantity: mockQuantity,
              instrument: { symbol: "FB_011924C330", assetType: "OPTION" },
            },
          ],
        },
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if the options trade placement fails", async () => {
      const mockQuantity = 10;
      const mockPrice = 6.45;

      const mockError = new Error("Options trade placement failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.placeOptionsTrade(
          "FB_011924C330",
          mockPrice,
          "BUY",
          mockQuantity,
          AccountType.REGULAR,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe("cancelOrder", () => {
    it("should cancel an order and return the result", async () => {
      const mockOrderId = "12345";
      const mockResponse = { data: { success: true } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.cancelOrder(mockOrderId);

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        params: undefined,
        url: `${schwabTraderApiUrl}/orders/${mockOrderId}`,
        method: "delete",
        headers: { Authorization: token },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the order cancellation fails", async () => {
      const mockOrderId = "12345";
      const mockError = new Error("Order cancellation failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.cancelOrder(mockOrderId)).rejects.toThrow(
        mockError,
      );
    });
  });

  describe("getOrder", () => {
    it("should get an order and return the result", async () => {
      const mockOrderId = "12345";
      const mockResponse = { data: { orderId: "12345", status: "FILLED" } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getOrder(mockOrderId);

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders/${mockOrderId}`,
        method: "get",
        headers: { Authorization: token },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting the order fails", async () => {
      const mockOrderId = "12345";
      const mockError = new Error("Getting order failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getOrder(mockOrderId)).rejects.toThrow(mockError);
    });
  });

  describe("getStockData", () => {
    it("should get stock data and return the result", async () => {
      const mockStockName = "AAPL";
      const mockResponse = { data: { AAPL: { price: 150 } } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getStockData(mockStockName);

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabMarketDataUrl}/${mockStockName}/quotes`,
        method: "get",
        headers: { Authorization: token },
      });
      expect(result).toEqual(mockResponse.data.AAPL);
    });

    it("should throw an error if getting stock data fails", async () => {
      const mockStockName = "AAPL";
      const mockError = new Error("Getting stock data failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getStockData(mockStockName)).rejects.toThrow(
        mockError,
      );
    });
  });

  describe("getStockDataMultiple", () => {
    it("should get multiple stock data and return the result", async () => {
      const mockStockNames = "AAPL,GOOGL";
      const mockResponse = {
        data: { AAPL: { price: 150 }, GOOGL: { price: 2800 } },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getStockDataMultiple(mockStockNames);

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabMarketDataUrl}/quotes`,
        method: "get",
        headers: { Authorization: token },
        params: { symbols: mockStockNames, fields: "quote", indicative: false },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting multiple stock data fails", async () => {
      const mockStockNames = "AAPL,GOOGL";
      const mockError = new Error("Getting multiple stock data failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.getStockDataMultiple(mockStockNames),
      ).rejects.toThrow(mockError);
    });
  });

  describe("getStocks", () => {
    it("should get stocks and return the result", async () => {
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockResponse = {
        data: {
          quoteResponse: {
            result: [
              { symbol: "AAPL", price: 150 },
              { symbol: "GOOGL", price: 2800 },
            ],
          },
        },
      };
      (axios.get as jest.Mock).mockResolvedValue(mockResponse);
      const result = await SchwabAPI.getStocks(mockSymbols);

      expect(axios.get).toHaveBeenCalledWith(
        `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${mockSymbols}`,
        {
          headers: {
            "x-rapidapi-host": "apidojo-yahoo-finance-v1.p.rapidapi.com",
            "x-rapidapi-key": YAHOO_KEY,
          },
          timeout: 30000,
        },
      );
      expect(result).toEqual(mockResponse.data.quoteResponse.result);
    });

    it("should throw an error if getting stocks fails", async () => {
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockError = new Error("Getting stocks failed");
      (axios.get as jest.Mock).mockRejectedValue(mockError);
      await expect(SchwabAPI.getStocks(mockSymbols)).rejects.toThrow(mockError);
    });
  });

  describe("getTrades", () => {
    it("should get trades and return the result", async () => {
      const mockRange = { start: "2023-01-01", end: "2023-01-31" };
      const normalizedRange = {
        start: new Date(mockRange.start).toISOString(),
        end: new Date(mockRange.end).toISOString(),
      };
      const mockResponse = { data: [{ tradeId: "12345", symbol: "AAPL" }] };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getTrades(mockRange);

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        url: `${schwabTraderApiUrl}/transactions`,
        method: "get",
        headers: { Authorization: token },
        params: {
          types: "TRADE",
          startDate: normalizedRange.start,
          endDate: normalizedRange.end,
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting trades fails", async () => {
      const mockRange = { start: "2023-01-01", end: "2023-01-31" };
      const mockError = new Error("Getting trades failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getTrades(mockRange)).rejects.toThrow(mockError);
    });
  });

  describe("replaceOrder", () => {
    it("should replace an order and return the result", async () => {
      const mockOrderId = "12345";
      const mockSymbol = "AAPL";
      const mockPrice = 150;
      const mockOrderType = "LIMIT";
      const mockQuantity = 10;
      const mockResponse = { headers: { location: "newOrderLocation" } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.replaceOrder(
        mockOrderId,
        mockSymbol,
        mockPrice,
        mockOrderType,
        mockQuantity,
      );

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders/${mockOrderId}`,
        method: "put",
        headers: { Authorization: token },
        data: {
          orderType: mockOrderType,
          session: "NORMAL",
          duration: "DAY",
          orderStrategyType: "SINGLE",
          price: "" + mockPrice,
          orderLegCollection: [
            {
              instruction: "LIMIT",
              quantity: mockQuantity,
              instrument: { symbol: mockSymbol, assetType: "EQUITY" },
            },
          ],
        },
        params: undefined,
      });
      expect(result).toEqual(mockResponse.headers.location);
    });

    it("should throw an error if replacing the order fails", async () => {
      const mockOrderId = "12345";
      const mockSymbol = "AAPL";
      const mockPrice = 150;
      const mockOrderType = "LIMIT";
      const mockQuantity = 10;
      const mockError = new Error("Replacing order failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.replaceOrder(
          mockOrderId,
          mockSymbol,
          mockPrice,
          mockOrderType,
          mockQuantity,
        ),
      ).rejects.toThrow(mockError);
    });
  });
  describe("getOptionsChains", () => {
    it("should get options chains and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockStrikes = 10;
      const mockResponse = {
        data: { options: [{ symbol: "AAPL", strike: 150 }] },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getOptionsChains(mockSymbol, mockStrikes);

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabMarketDataUrl}/chains`,
        method: "get",
        headers: { Authorization: token },
        params: {
          strikeCount: mockStrikes,
          contractType: "ALL",
          optionType: "S",
          symbol: mockSymbol,
        },
        data: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting options chains fails", async () => {
      const mockSymbol = "AAPL";
      const mockStrikes = 10;
      const mockError = new Error("Getting options chains failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.getOptionsChains(mockSymbol, mockStrikes),
      ).rejects.toThrow(mockError);
    });
  });

  // // Add tests for the remaining functions: buyStock, shortStock, sellStock, buyToCoverStock, computePayloadOption, computePayload, callSchwabApi, reCheckAccesstoken, testAccessToken, resetAccesstoken, getTransactionHistory, getBuyingPower, getHistoryForstock, getHistoryWithbounds, isMarketOpen

  describe("buyStock", () => {
    it("should buy stock and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const orderId = "12345";
      const mockResponse = { headers: { location: `/${orderId}` } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.buyStock(
        mockSymbol,
        mockPrice,
        mockQuantity,
      );

      expect(axios).toHaveBeenCalledWith({
        data: payload,
        headers: { Authorization: token },
        method: "post",
        params: undefined,
        url: `${schwabTraderApiUrl}/orders`,
      });
      expect(result).toEqual(orderId);
    });

    it("should throw an error if buying stock fails", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const mockError = new Error("Buying stock failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.buyStock(mockSymbol, mockQuantity, mockPrice),
      ).rejects.toThrow(mockError);
    });
  });

  describe("shortStock", () => {
    it("should short stock and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const orderId = "12345";
      const mockResponse = { headers: { location: `/${orderId}` } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.shortStock(
        mockSymbol,
        mockPrice,
        mockQuantity,
      );

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders`,
        data: sellShortPayload,
        method: "post",
        headers: { Authorization: token },
        params: undefined,
      });
      expect(result).toEqual(orderId);
    });

    it("should throw an error if shorting stock fails", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const mockError = new Error("Shorting stock failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.shortStock(mockSymbol, mockQuantity, mockPrice),
      ).rejects.toThrow(mockError);
    });
  });

  describe("sellStock", () => {
    it("should sell stock and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const orderId = "12345";
      const mockResponse = { headers: { location: `/${orderId}` } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.sellStock(
        mockSymbol,
        mockPrice,
        mockQuantity,
      );

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders`,
        data: sellPayload,
        method: "post",
        headers: { Authorization: token },
        params: undefined,
      });
      expect(result).toEqual(orderId);
    });

    it("should throw an error if selling stock fails", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const mockError = new Error("Selling stock failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.sellStock(mockSymbol, mockPrice, mockQuantity),
      ).rejects.toThrow(mockError);
    });
  });

  describe("buyToCoverStock", () => {
    it("should buy to cover stock and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const orderId = "12345";
      const mockResponse = { headers: { location: `/${orderId}` } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.buyToCoverStock(
        mockSymbol,
        mockPrice,
        mockQuantity,
      );

      expect(axios).toHaveBeenCalledWith({
        url: `${schwabTraderApiUrl}/orders`,
        data: buyToCoverPayload,
        method: "post",
        headers: { Authorization: token },
        params: undefined,
      });
      expect(result).toEqual(orderId);
    });

    it("should throw an error if buying to cover stock fails", async () => {
      const mockSymbol = "AAPL";
      const mockQuantity = 10;
      const mockPrice = 150;
      const mockError = new Error("Buying to cover stock failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.buyToCoverStock(mockSymbol, mockQuantity, mockPrice),
      ).rejects.toThrow(mockError);
    });
  });

  describe("callSchwabApi", () => {
    it("should call Schwab API and return the result", async () => {
      const mockUrl = "https://api.schwab.com";
      const mockMethod = "GET";
      const mockResponse = { data: { success: true } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.callSchwabApi(mockUrl, mockMethod);

      expect(axios).toHaveBeenCalledWith({
        url: mockUrl,
        method: mockMethod,
        headers: { Authorization: token },
      });
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if calling Schwab API fails", async () => {
      const mockUrl = "https://api.schwab.com";
      const mockMethod = "GET";
      const mockError = new Error("API call failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.callSchwabApi(mockUrl, mockMethod),
      ).rejects.toThrow(mockError);
    });
  });

  describe("getTransactionHistory", () => {
    it("should get transaction history and return the result", async () => {
      const mockRange = { start: "2023-01-01", end: "2023-01-31" };
      const normalizedRange = {
        start: new Date(mockRange.start).toISOString(),
        end: new Date(mockRange.end).toISOString(),
      };
      const mockResponse = {
        data: [{ transactionId: "12345", symbol: "AAPL" }],
      };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getTransactionHistory(
        "AAPL",
        mockRange.start,
        mockRange.end,
      );

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabTraderApiUrl}/transactions`,
        params: {
          types: "TRADE",
          symbol: "AAPL",
          startDate: normalizedRange.start,
          endDate: normalizedRange.end,
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting transaction history fails", async () => {
      const mockRange = { start: "2023-01-01", end: "2023-01-31" };
      const mockError = new Error("Getting transaction history failed");
      mockedAxios.mockRejectedValue(mockError);
      await expect(
        SchwabAPI.getTransactionHistory("AAPL", mockRange.start, mockRange.end),
      ).rejects.toThrow(mockError);
    });
  });

  describe("getBuyingPower", () => {
    it("should get buying power and return the result", async () => {
      const mockResponse = {
        data: {
          securitiesAccount: { currentBalances: { cashBalance: 10000 } },
        },
      };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getBuyingPower();

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabTraderApiUrl}`,
        params: { fields: "positions" },
      });
      expect(result).toEqual(
        mockResponse.data.securitiesAccount.currentBalances.cashBalance,
      );
    });

    it("should throw an error if getting buying power fails", async () => {
      const mockError = new Error("Getting buying power failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.getBuyingPower()).rejects.toThrow(mockError);
    });
  });

  describe("getHistoryForStock", () => {
    it("should get history for stock and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockResponse = { data: [{ date: "2023-01-01", price: 150 }] };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getHistoryForStock(
        mockSymbol,
        "day",
        10,
        "minute",
        1,
      );

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabMarketDataUrl}/pricehistory`,
        params: {
          symbol: mockSymbol,
          frequencyType: "minute",
          periodType: "day",
          frequency: 1,
          needExtendedHoursData: false,
          period: 10,
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting history for stock fails", async () => {
      const mockSymbol = "AAPL";
      const mockError = new Error("Getting history for stock failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.getHistoryForStock(mockSymbol, "day", 10, "minute", 1),
      ).rejects.toThrow(mockError);
    });
  });

  describe("getHistoryWithBounds", () => {
    it("should get history with bounds and return the result", async () => {
      const mockSymbol = "AAPL";
      const mockStart = "2023-01-01";
      const mockEnd = "2023-01-31";
      const mockResponse = { data: [{ date: "2023-01-01", price: 150 }] };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.getHistoryWithBounds(
        mockSymbol,
        "day",
        "minute",
        1,
        new Date(mockStart).getTime(),
        new Date(mockEnd).getTime(),
      );

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabMarketDataUrl}/pricehistory`,
        params: {
          symbol: mockSymbol,
          frequencyType: "minute",
          periodType: "day",
          frequency: 1,
          needExtendedHoursData: false,
          startDate: new Date(mockStart).getTime(),
          endDate: new Date(mockEnd).getTime(),
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if getting history with bounds fails", async () => {
      const mockSymbol = "AAPL";
      const mockStart = "2023-01-01";
      const mockEnd = "2023-01-31";
      const mockError = new Error("Getting history with bounds failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(
        SchwabAPI.getHistoryWithBounds(
          mockSymbol,
          "day",
          "minute",
          1,
          new Date(mockStart).getTime(),
          new Date(mockEnd).getTime(),
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe("isMarketOpen", () => {
    it("should check if the market is open and return the result", async () => {
      const mockResponse = { data: { equity: { isOpen: true } } };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.isMarketOpen();

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabMarketDataUrl}/markets`,
        params: { markets: "equity" },
      });
      expect(result).toEqual(true);
    });

    it("should throw an error if checking market state fails", async () => {
      const mockError = new Error("Checking market state failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.isMarketOpen()).rejects.toThrow(mockError);
    });
  });

  describe("testAccessToken", () => {
    it("should test access token and return the result", async () => {
      const mockResponse = { success: true };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await SchwabAPI.testAccessToken();

      expect(axios).toHaveBeenCalledWith({
        data: undefined,
        headers: { Authorization: token },
        method: "get",
        url: `${schwabMarketDataUrl}/AAPL/quotes`,
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if testing access token fails", async () => {
      const mockError = new Error("Testing access token failed");
      mockedAxios.mockRejectedValue(mockError);

      await expect(SchwabAPI.testAccessToken()).rejects.toThrow(mockError);
    });
  });

  describe("reCheckAccessToken", () => {
    it("should re-check access token and return the result", async () => {
      const mockResponse = "new_token";
      mockedAxios.mockResolvedValue(mockResponse);
      DatabaseAPI.runQuery = jest
        .fn()
        .mockResolvedValue([{ value: mockResponse }]);
      const result = await SchwabAPI.reCheckAccessToken();
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if re-checking access token fails", async () => {
      const mockError = new Error("Re-checking access token failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(SchwabAPI.reCheckAccessToken()).rejects.toThrow(mockError);
    });
  });

  describe("resetAccessToken", () => {
    it("should get access token and update the database", async () => {
      const mockResponse = { data: { access_token: "test_token" } };
      (axios.get as jest.Mock).mockResolvedValue(mockResponse);
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(undefined);

      const result = await SchwabAPI.resetAccessToken();

      expect(axios.get).toHaveBeenCalledWith(`${AWS_URL}/get-token`, {
        timeout: 30000,
      });
      expect(result).toBeUndefined();
    });

    it("should throw an error if getting access token fails", async () => {
      const mockError = new Error("Getting access token failed");
      (axios.get as jest.Mock).mockRejectedValue(mockError);

      await expect(SchwabAPI.resetAccessToken()).rejects.toThrow(mockError);
    });
  });

  describe("reCheckAccessToken", () => {
    it("should reset access token and return the result", async () => {
      const refreshToken = "test_refresh_token";
      const mockResponse = [{ value: refreshToken }];
      DatabaseAPI.runQuery = jest.fn().mockResolvedValue(mockResponse);
      const result = await SchwabAPI.reCheckAccessToken();

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(
        "select value from properties where name='access_token'",
      );
      expect(result).toEqual(refreshToken);
    });

    it("should throw an error if resetting access token fails", async () => {
      const mockError = new Error("Resetting access token failed");
      DatabaseAPI.runQuery = jest.fn().mockRejectedValue(mockError);
      await expect(SchwabAPI.reCheckAccessToken()).rejects.toThrow(mockError);
    });
  });
});
