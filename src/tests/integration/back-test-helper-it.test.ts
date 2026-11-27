//import dotenv from "dotenv";
import { BackTestHelper } from "../../back-testing/back-test-helper";
import { SchwabMarketData } from "../../providers/schwab/schwab-market-data";
import { MassiveMarketData } from "../../providers/massive/massive-market-data";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { DatabaseAPI } from "../../shared/services/db-api";
import { ITestConfig } from "../../types/back-test-types";
import { PeriodType } from "../../shared/constants";

describe("BackTestHelper Integration", () => {
  let helper: BackTestHelper;
  let testConfig: ITestConfig;
  let symbols: string[];

  beforeAll(async () => {
    helper = new BackTestHelper();
    //dotenv.config();
    await SchwabAuth.initialize();
    const date = new Date();
    // Example config, adjust times and symbols as needed for your test data
    testConfig = {
      startTime: Date.UTC(2025, date.getMonth(), 1, 2, 0, 0), // Aug 1, 2025 2:00 AM UTC
      endTime: Date.UTC(2025, date.getMonth(), 2, 23, 0, 0), // Aug 2, 2025 11:00 PM UTC
    };
    symbols = ["AAPL"];
  }, 60000);

  // SchwabAuth reads the sign-in from the database, which opens the pool
  afterAll(async () => {
    await DatabaseAPI.closeConnection();
  });

  it("should initialize candle data and retrieve test data for each period", async () => {
    const responses = await new SchwabMarketData().getCandles(
      PeriodType.MINUTE,
      symbols,
      testConfig.startTime,
      testConfig.endTime,
    );

    const responses2 = await new MassiveMarketData().getCandles(
      PeriodType.MINUTE,
      symbols,
      testConfig.startTime,
      testConfig.endTime,
    );
    expect(responses.length).toBe(symbols.length);
    expect(responses2.length).toBe(symbols.length);
  });

  it("should get polygon history more than 50000 candles", async () => {
    const wideRange = {
      startTime: Date.UTC(2025, 0, 1, 9, 0, 0), // Jan 1, 2025 9:00 AM UTC
      endTime: Date.UTC(2025, 1, 1, 21, 0, 0), // Jan 1, 2025 9:00 PM UTC
    };
    const polygonResponses = await new MassiveMarketData().getCandles(
      PeriodType.MINUTE,
      symbols,
      wideRange.startTime,
      wideRange.endTime,
    );
    expect(polygonResponses.length).toBe(symbols.length);
  });

  it("should initialize candle data", async () => {
    const candleData = await helper.initCandleData(
      testConfig,
      [PeriodType.MINUTE],
      symbols,
    );
    expect(Object.keys(candleData).length).toBe(symbols.length);
  });
});
