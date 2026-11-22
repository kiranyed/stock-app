import { HistoricalWarmupService } from "../../run/historical-warmup-service";
import { SchwabAPI } from "../../shared/services/trading-api";
import { CONSTANTS, MemoryType, PeriodType } from "../../shared/constants";
import {
  IInitializedJobData,
  IStockScreenerJob,
} from "../../types/data-processing-types";
import { IStockGroup } from "../../types/entity-types";

const makeEmptySlice = (): IInitializedJobData => ({
  newNames: {
    [PeriodType.MINUTE]: [],
    [PeriodType.FIVE_MINUTES]: [],
    [PeriodType.TEN_MINUTES]: [],
    [PeriodType.THIRTY_MINUTES]: [],
    [PeriodType.HOUR]: [],
    [PeriodType.DAY]: [],
  },
  newFilterData: {
    [PeriodType.MINUTE]: {},
    [PeriodType.FIVE_MINUTES]: {},
    [PeriodType.TEN_MINUTES]: {},
    [PeriodType.THIRTY_MINUTES]: {},
    [PeriodType.HOUR]: {},
    [PeriodType.DAY]: {},
  },
  newMemories: {
    [PeriodType.MINUTE]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
    [PeriodType.FIVE_MINUTES]: {
      [MemoryType.PRICE]: {},
      [MemoryType.VOLUME]: {},
    },
    [PeriodType.TEN_MINUTES]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
    [PeriodType.THIRTY_MINUTES]: {
      [MemoryType.PRICE]: {},
      [MemoryType.VOLUME]: {},
    },
    [PeriodType.HOUR]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
    [PeriodType.DAY]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
  },
});

describe("Integration - Historical Warmup", () => {
  let schwabReady = false;

  beforeAll(async () => {
    try {
      await SchwabAPI.initialize();
      await SchwabAPI.testAccessToken();
      schwabReady = true;
    } catch {
      schwabReady = false;
    }
  });

  it("warms AAPL day PRICE memory with Schwab daily candle closes", async () => {
    if (!schwabReady) {
      console.warn(
        "Skipping historical warmup integration test: Schwab auth unavailable.",
      );
      return;
    }

    const jobs: IStockScreenerJob[] = [];
    const group: IStockGroup = {
      id: 1,
      name: "warmup-test-group",
      symbols: ["AAPL"],
    };
    const slice = makeEmptySlice();
    const space = 5;
    slice.newNames[PeriodType.DAY] = ["AAPL"];
    slice.newMemories[PeriodType.DAY][MemoryType.PRICE].AAPL = {
      space,
      list: new Array(space).fill(NaN),
      lastTime: 0,
    };

    // Use a fixed past date so this test is deterministic and not dependent on current market session.
    const fixedEndTime = Date.UTC(2025, 8, 18, 20, 0, 0);

    const warmed = await HistoricalWarmupService.warmInitializedSlice(
      jobs,
      group,
      slice,
      fixedEndTime,
    );

    const warmedPriceMemory =
      warmed.newMemories[PeriodType.DAY][MemoryType.PRICE].AAPL;
    expect(warmedPriceMemory.list).toHaveLength(space);
    expect(warmedPriceMemory.lastTime).toBeGreaterThan(0);

    const expected = await SchwabAPI.getHistoryWithBounds(
      "AAPL",
      "month",
      "daily",
      1,
      warmedPriceMemory.lastTime - 120 * CONSTANTS.MILLIS_IN_DAY,
      warmedPriceMemory.lastTime,
    );
    const expectedTail = expected.candles.slice(-space).map((candle) => candle.close);

    expect(expectedTail.length).toBe(space);
    expect(warmedPriceMemory.list).toEqual(expectedTail);
  }, 120000);

});