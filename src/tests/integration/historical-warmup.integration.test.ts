import { HistoricalWarmupService } from "../../run/historical-warmup-service";
import { SchwabAuth } from "../../providers/schwab/schwab-auth";
import { SchwabClient } from "../../providers/schwab/schwab-client";
import { DatabaseAPI } from "../../shared/services/db-api";
import { CONSTANTS, PeriodType } from "../../shared/constants";
import { IStockGroup } from "../../types/entity-types";
import { ProbeBackTest, strategy } from "../golden/golden-harness";

describe("Integration - Historical Warmup", () => {
  let schwabReady = false;

  beforeAll(async () => {
    try {
      await SchwabAuth.initialize();
      await SchwabAuth.getAccessToken();
      schwabReady = true;
    } catch {
      schwabReady = false;
    }
  }, 60000);

  // SchwabAuth reads the sign-in from the database, which opens the pool
  afterAll(async () => {
    await DatabaseAPI.closeConnection();
  });

  it("warms an AAPL daily SMA5 from Schwab daily candle closes", async () => {
    if (!schwabReady) {
      console.warn(
        "Skipping historical warmup integration test: Schwab auth unavailable.",
      );
      return;
    }

    const group: IStockGroup = { id: 1, name: "warmup-test-group", symbols: ["AAPL"] };
    const job = new ProbeBackTest(
      strategy(PeriodType.DAY, [{ varName: "priceSma", timeAgo: "5", operator: ">", compareVal: "0" }]),
    );

    // Use a fixed past date so this test is deterministic and not dependent on current market session.
    const fixedEndTime = Date.UTC(2025, 8, 18, 20, 0, 0);
    const warmed = await HistoricalWarmupService.warm([job], group, fixedEndTime);

    const expected = await SchwabClient.getPriceHistory(
      "AAPL",
      "month",
      "daily",
      1,
      fixedEndTime - 120 * CONSTANTS.MILLIS_IN_DAY,
      fixedEndTime,
    );
    const tail = expected.candles.slice(-5).map((candle) => candle.close);
    expect(tail).toHaveLength(5);
    expect(warmed.get("AAPL", PeriodType.DAY, "priceSma5")?.value).toBeCloseTo(
      tail.reduce((a, b) => a + b, 0) / 5,
      6,
    );
  }, 120000);
});
