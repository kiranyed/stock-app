import { filterVariables, primaryVariable } from "../../engine/filter-specs";
import { PeriodType } from "../../shared/constants";
import { IFilter } from "../../types/strategy-types";

const name = (f: object, period = PeriodType.MINUTE) =>
  primaryVariable({ operator: ">", compareVal: "0", ...f } as IFilter, period).name;

describe("filter → variable names", () => {
  it.each([
    [{ varName: "price" }, "price"],
    [{ varName: "volume" }, "volume"],
    [{ varName: "percentchange", timeAgo: "5" }, "percentchange5"],
    [{ varName: "priceSma", timeAgo: "20" }, "priceSma20"],
    [{ varName: "priceEma", timeAgo: "12" }, "priceEma12"],
    [{ varName: "volumeSma", timeAgo: "20" }, "volumeSma20"],
    [{ varName: "rsi", timeAgo: "14" }, "rsi14"],
    [{ varName: "rsi", period: 14 }, "rsi14"],
    [{ varName: "bollingerBands", period: 20, multiplier: 2 }, "bollingerBands20Multiplier2Upper"],
    [{ varName: "bollingerBands", period: 20, multiplier: 2.5, band: "lower" }, "bollingerBands20Multiplier2.5Lower"],
    [{ varName: "bollingerLower", timeAgo: "20" }, "bollingerBands20Multiplier2Lower"],
    [{ varName: "macd", fastPeriod: 12, slowPeriod: 26 }, "macdFast12Slow26"],
    [{ varName: "macdSignalLine", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, "macdFast12Slow26Signal9"],
    [{ varName: "macdCrossover", fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, crossoverLevel: 0, periodsBefore: 2, periodsAfter: 3, bullish: true }, "macdFast12Slow26Signal9BullishCrossoverPeriodsBefore2PeriodsAfter3"],
    [{ varName: "rsiCrossover", period: 14, crossoverLevel: 30, periodsBefore: 2, periodsAfter: 2, bullish: false }, "rsi14BearishCrossover30PeriodsBefore2PeriodsAfter2"],
    [{ varName: "rsiDivergence", period: 14, lookback: 20, periodsBefore: 3, periodsAfter: 3, bullish: "false" }, "rsi14BearishDivergenceLookback20"],
    [{ varName: "macdDivergence", fastPeriod: 12, slowPeriod: 26, lookback: 30, bullish: true }, "macdFast12Slow26BullishDivergenceLookback30"],
    [{ varName: "vwap" }, "vwap1"],
    [{ varName: "vwap", timeAgo: "5" }, "vwap5"],
    [{ varName: "mtsi", emaPeriod1: 5, emaPeriod2: 3, vwapPeriod: 1 }, "mtsiM5N3Vwap1"],
    [{ varName: "tsi", emaPeriod1: 13, emaPeriod2: 7 }, "tsiM13N7"],
    [{ varName: "pricePercentChangePercentile", timeAgo: "1", numberOfSessions: "2" }, "pricePercentChange1PercentileSessions2"],
    [{ varName: "percentGain" }, "percentGain"],
    [{ varName: "timeSinceEntry" }, "timeSinceEntry"],
  ])("%o → %s", (filter, expected) => {
    expect(name(filter)).toBe(expected);
  });

  it("vwap defaults to the strategy's period", () => {
    expect(name({ varName: "vwap" }, PeriodType.THIRTY_MINUTES)).toBe("vwap30");
  });

  it("includes the compare variable", () => {
    const vars = filterVariables(
      { varName: "percentchange", timeAgo: "1", operator: "<", compareVal: "", compareVar: "priceSma", compareVarTimeAgo: "20" },
      PeriodType.MINUTE,
    );
    expect(vars.map((v) => v.name)).toEqual(["percentchange1", "priceSma20"]);
  });

  it.each([
    [{ varName: "adx", timeAgo: "14" }, /Unsupported variable "adx"/],
    [{ varName: "percentchange" }, /percentchange: missing timeAgo/],
    [{ varName: "volumeSma" }, /volumeSma: missing timeAgo/],
    [{ varName: "macd", fastPeriod: 26, slowPeriod: 12 }, /fast \(26\) must be less than slow/],
    [{ varName: "priceSma", timeAgo: "abc" }, /bars must be a positive integer/],
    [{ varName: "vwap", timeAgo: "7" }, /barPeriod must be one of/],
  ])("rejects %o", (filter, message) => {
    expect(() => name(filter)).toThrow(message);
  });
});
