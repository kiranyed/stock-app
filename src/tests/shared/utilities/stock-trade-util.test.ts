import { StockTradeUtil } from "../../../shared/utilities/stock-trade";
import { CONSTANTS, PeriodType } from "../../../shared/constants";
import { IGain } from "../../../types/strategy-types";
import { IGainTotal } from "../../../types/back-test-types";

jest.mock("../../../shared/services/trading-api");
jest.mock("../../../shared/utilities/time-util", () => ({
  getOffset: jest.fn().mockReturnValue(-300),
}));
const OFFSET = -300;
describe("StockTradeUtil", () => {
  describe("computeOffset", () => {
    it("should compute offset between UTC and East Coast time", () => {
      const datetime = new Date("2024-01-01T12:00:00Z").getTime();
      const offset = StockTradeUtil.computeOffset(datetime);
      expect(typeof offset).toBe("number");
      expect(offset).toBeLessThanOrEqual(0);
      expect(offset).toBeGreaterThanOrEqual(OFFSET);
    });
  });

  describe("getGainsNumbers", () => {
    it("should calculate gains with default portfolio size", () => {
      const gains = [1.05, 1.1, 0.95];
      const result = StockTradeUtil.getGainsNumbers(gains);
      expect(result).toBeCloseTo(9.725, 1);
    });

    it("should calculate gains with custom portfolio size", () => {
      const gains = [1.1, 1.05];
      const result = StockTradeUtil.getGainsNumbers(gains, 2);
      expect(result).toBeCloseTo(7.625, 1);
    });

    it("should return 0 for single gain of 1", () => {
      const gains = [1];
      const result = StockTradeUtil.getGainsNumbers(gains);
      expect(result).toBeCloseTo(0, 1);
    });
  });

  describe("getGainsNumbersNoPercent", () => {
    it("should calculate gains ratio without percentage", () => {
      const gains = [1.05, 1.1];
      const result = StockTradeUtil.getGainsNumbersNoPercent(gains);
      expect(result).toBeCloseTo(1.1575, 2);
    });
  });

  describe("getGains", () => {
    it("should calculate gains from IGain array", () => {
      const gains: IGain[] = [
        {
          symbol: "AAPL",
          gain: 1.05,
          time: 100,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: -2,
          lowestLossTime: 100,
          highestGainPercent: 5,
          highestGainTime: 150,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
        {
          symbol: "AAPL",
          gain: 1.1,
          time: 150,
          timeFormatted: "12:30 PM",
          atClose: false,
          lowestLossPercent: -1,
          lowestLossTime: 150,
          highestGainPercent: 5,
          highestGainTime: 150,
          enteredTime: 120,
          enteredTimeFormatted: "12:00 PM",
          test: true,
        },
      ];
      const result = StockTradeUtil.getGains(gains);
      expect(result).toBeCloseTo(15.55, 1);
    });

    it("should calculate gains with portfolio size", () => {
      const gains: IGain[] = [
        {
          symbol: "AAPL",
          gain: 1.1,
          time: 100,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 100,
          highestGainPercent: 0,
          highestGainTime: 100,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
      ];
      const result = StockTradeUtil.getGains(gains, 2);
      expect(result).toBeCloseTo(5, 1);
    });
  });

  describe("getGainsNoPercent", () => {
    it("should calculate gains ratio from IGain array", () => {
      const gains: IGain[] = [
        {
          symbol: "AAPL",
          gain: 1.05,
          time: 100,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 100,
          highestGainPercent: 0,
          highestGainTime: 100,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
        {
          symbol: "AAPL",
          gain: 1.1,
          time: 150,
          timeFormatted: "12:30 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 150,
          highestGainPercent: 0,
          highestGainTime: 150,
          enteredTime: 120,
          enteredTimeFormatted: "12:00 PM",
          test: true,
        },
      ];
      const result = StockTradeUtil.getGainsNoPercent(gains);
      expect(result).toBeCloseTo(1.1575, 2);
    });
  });

  describe("addGains", () => {
    it("should separate gains into positive and negative", () => {
      const gains: IGain[] = [
        {
          symbol: "AAPL",
          gain: 1.1,
          time: 100,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: -2,
          lowestLossTime: 100,
          highestGainPercent: 5,
          highestGainTime: 150,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
        {
          symbol: "AAPL",
          gain: 0.95,
          time: 150,
          timeFormatted: "12:30 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 150,
          highestGainPercent: 0,
          highestGainTime: 150,
          enteredTime: 120,
          enteredTimeFormatted: "12:00 PM",
          test: true,
        },
        {
          symbol: "AAPL",
          gain: 1.05,
          time: 120,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 120,
          highestGainPercent: 0,
          highestGainTime: 120,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
      ];
      const result = StockTradeUtil.addGains(gains);
      expect(result).toBeCloseTo(0.1, 2);
    });

    it("should return negative total for all losses", () => {
      const gains: IGain[] = [
        {
          symbol: "AAPL",
          gain: 0.9,
          time: 100,
          timeFormatted: "12:00 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 100,
          highestGainPercent: 0,
          highestGainTime: 100,
          enteredTime: 90,
          enteredTimeFormatted: "11:00 AM",
          test: true,
        },
        {
          symbol: "AAPL",
          gain: 0.95,
          time: 150,
          timeFormatted: "12:30 PM",
          atClose: false,
          lowestLossPercent: 0,
          lowestLossTime: 150,
          highestGainPercent: 0,
          highestGainTime: 150,
          enteredTime: 120,
          enteredTimeFormatted: "12:00 PM",
          test: true,
        },
      ];
      const result = StockTradeUtil.addGains(gains);
      expect(result).toBeLessThan(0);
    });
  });

  describe("getUTCTime", () => {
    it("should return minutes in UTC day", () => {
      const result = StockTradeUtil.getUTCTime();
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1440);
    });
  });

  describe("getMinutesInDayEastCoast", () => {
    it("should return minutes in East Coast day", () => {
      const date = new Date("2024-01-01T12:00:00Z");
      const result = StockTradeUtil.getMinutesInDayEastCoast(date);
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1440);
    });
  });

  describe("getMinutesInDay", () => {
    it("should return minutes in day for given date", () => {
      const date = new Date("2024-01-01T15:30:00Z");
      const result = StockTradeUtil.getMinutesInDay(date);
      expect(result).toBe(date.getHours() * 60 + date.getMinutes());
    });

    it("should return minutes for midnight UTC", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const result = StockTradeUtil.getMinutesInDay(date);
      expect(result).toBe(date.getHours() * 60 + date.getMinutes());
    });

    it("should return correct minutes for afternoon", () => {
      const date = new Date("2024-01-01T14:30:00Z");
      const result = StockTradeUtil.getMinutesInDay(date);
      expect(result).toBe(date.getHours() * 60 + date.getMinutes());
    });
  });

  describe("getEastCoastDate", () => {
    // All assertions use .getHours()/.getMinutes() on the returned Date,
    // which carries East Coast wall-clock values regardless of server TZ.

    it("converts UTC winter timestamp to EST (UTC-5)", () => {
      // 2024-01-15 20:59:00 UTC  →  3:59 PM EST
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-01-15T20:59:00Z"),
      );
      expect(result.getHours()).toBe(15);
      expect(result.getMinutes()).toBe(59);
    });

    it("converts UTC summer timestamp to EDT (UTC-4)", () => {
      // 2024-07-10 19:59:00 UTC  →  3:59 PM EDT
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-07-10T19:59:00Z"),
      );
      expect(result.getHours()).toBe(15);
      expect(result.getMinutes()).toBe(59);
    });

    it("handles Pacific winter input (UTC-8) correctly → EST", () => {
      // 2024-01-15 12:59:00 PST = 20:59:00 UTC  →  3:59 PM EST
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-01-15T20:59:00Z"),
      );
      expect(result.getHours()).toBe(15);
      expect(result.getMinutes()).toBe(59);
    });

    it("handles Pacific summer input (UTC-7) correctly → EDT", () => {
      // 2024-07-10 12:59:00 PDT = 19:59:00 UTC  →  3:59 PM EDT
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-07-10T19:59:00Z"),
      );
      expect(result.getHours()).toBe(15);
      expect(result.getMinutes()).toBe(59);
    });

    it("handles midnight UTC in winter (EST) without Invalid Date", () => {
      // 2024-01-15 00:00:00 UTC  →  7:00 PM EST prev day (Jan 14 19:00)
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-01-15T00:00:00Z"),
      );
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(0);
    });

    it("handles midnight UTC in summer (EDT) without Invalid Date", () => {
      // 2024-07-10 00:00:00 UTC  →  8:00 PM EDT prev day (Jul 9 20:00)
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-07-10T00:00:00Z"),
      );
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
      expect(result.getHours()).toBe(20);
      expect(result.getMinutes()).toBe(0);
    });

    it("handles 5:00 AM UTC in winter (EST midnight edge)", () => {
      // 2024-01-15 05:00:00 UTC  →  12:00 AM EST
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-01-15T05:00:00Z"),
      );
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it("handles 4:00 AM UTC in summer (EDT midnight edge)", () => {
      // 2024-07-10 04:00:00 UTC  →  12:00 AM EDT
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-07-10T04:00:00Z"),
      );
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it("returns correct date component around DST spring-forward (2024-03-10)", () => {
      // Just before spring-forward: 2024-03-10 06:59:00 UTC  →  1:59 AM EST
      const before = StockTradeUtil.getEastCoastDate(
        new Date("2024-03-10T06:59:00Z"),
      );
      expect(before.getHours()).toBe(1);
      expect(before.getMinutes()).toBe(59);

      // Just after spring-forward: 2024-03-10 07:01:00 UTC  →  3:01 AM EDT
      const after = StockTradeUtil.getEastCoastDate(
        new Date("2024-03-10T07:01:00Z"),
      );
      expect(after.getHours()).toBe(3);
      expect(after.getMinutes()).toBe(1);
    });

    it("returns correct date component around DST fall-back (2024-11-03)", () => {
      // Just before fall-back: 2024-11-03 05:59:00 UTC  →  1:59 AM EDT
      const before = StockTradeUtil.getEastCoastDate(
        new Date("2024-11-03T05:59:00Z"),
      );
      expect(before.getHours()).toBe(1);
      expect(before.getMinutes()).toBe(59);

      // Just after fall-back: 2024-11-03 06:01:00 UTC  →  1:01 AM EST
      const after = StockTradeUtil.getEastCoastDate(
        new Date("2024-11-03T06:01:00Z"),
      );
      expect(after.getHours()).toBe(1);
      expect(after.getMinutes()).toBe(1);
    });

    it("does not roll March 1 midnight EST to March 2 (regression)", () => {
      // 2024-03-01 05:00:00 UTC = 2024-03-01 00:00:00 EST
      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-03-01T05:00:00Z"),
      );

      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(false);
      expect(result.getMonth()).toBe(2); // March (0-based)
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it("keeps the same date when formatter returns hour 24 at midnight (regression)", () => {
      const formatPartsSpy = jest
        .spyOn(StockTradeUtil.formatter, "formatToParts")
        .mockReturnValue([
          { type: "month", value: "03" },
          { type: "literal", value: "/" },
          { type: "day", value: "01" },
          { type: "literal", value: "/" },
          { type: "year", value: "2024" },
          { type: "literal", value: ", " },
          { type: "hour", value: "24" },
          { type: "literal", value: ":" },
          { type: "minute", value: "00" },
          { type: "literal", value: ":" },
          { type: "second", value: "00" },
        ] as Intl.DateTimeFormatPart[]);

      const result = StockTradeUtil.getEastCoastDate(
        new Date("2024-03-01T05:00:00Z"),
      );

      expect(result.getMonth()).toBe(2);
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);

      formatPartsSpy.mockRestore();
    });
  });

  describe("inBounds", () => {
    it("should return true for times within trading hours", () => {
      const datetime = new Date("2024-01-01T14:30:00Z").getTime();
      const result = StockTradeUtil.inBounds(datetime);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("periodisEligible", () => {
    it("should return true for DAY period", () => {
      const result = StockTradeUtil.periodisEligible(960, PeriodType.DAY);
      expect(result).toBe(true);
    });

    it("should return true when time is eligible for period", () => {
      const beginTime = CONSTANTS.BEGIN_TIME;
      const result = StockTradeUtil.periodisEligible(beginTime, 60);
      expect(result).toBe(true);
    });

    it("should return false when time is not eligible for period", () => {
      const beginTime = CONSTANTS.BEGIN_TIME;
      const result = StockTradeUtil.periodisEligible(beginTime + 30, 60);
      expect(result).toBe(false);
    });
  });

  describe("organizeGainsByGainTotal", () => {
    it("should sort gains by total in ascending order", () => {
      const gainz: IGainTotal[] = [
        {
          total: 50,
          gains: [
            {
              symbol: "AAPL",
              gainPercent: 50,
              timeFormatted: "12:00 PM",
              enteredTimeFormatted: "11:00 AM",
              atClose: false,
            },
          ],
          tradeNum: 1,
          avgTrade: 50,
          name: "Test1",
        },
        {
          total: 20,
          gains: [
            {
              symbol: "AAPL",
              gainPercent: 20,
              timeFormatted: "12:00 PM",
              enteredTimeFormatted: "11:00 AM",
              atClose: false,
            },
          ],
          tradeNum: 1,
          avgTrade: 20,
          name: "Test2",
        },
        {
          total: 35,
          gains: [
            {
              symbol: "AAPL",
              gainPercent: 35,
              timeFormatted: "12:00 PM",
              enteredTimeFormatted: "11:00 AM",
              atClose: false,
            },
          ],
          tradeNum: 1,
          avgTrade: 35,
          name: "Test3",
        },
      ];
      const result = StockTradeUtil.organizeGainsByGainTotal(gainz);
      expect(result[0].total).toBe(20);
      expect(result[1].total).toBe(35);
      expect(result[2].total).toBe(50);
    });

    it("should handle already sorted array", () => {
      const gainz: IGainTotal[] = [
        {
          total: 10,
          gains: [
            {
              symbol: "AAPL",
              gainPercent: 10,
              timeFormatted: "12:00 PM",
              enteredTimeFormatted: "11:00 AM",
              atClose: false,
            },
          ],
          tradeNum: 1,
          avgTrade: 10,
          name: "Test1",
        },
        {
          total: 20,
          gains: [
            {
              symbol: "AAPL",
              gainPercent: 20,
              timeFormatted: "12:00 PM",
              enteredTimeFormatted: "11:00 AM",
              atClose: false,
            },
          ],
          tradeNum: 1,
          avgTrade: 20,
          name: "Test2",
        },
      ];
      const result = StockTradeUtil.organizeGainsByGainTotal(gainz);
      expect(result[0].total).toBe(10);
      expect(result[1].total).toBe(20);
    });
  });

  describe("getStringSurroundedByQuotes", () => {
    it("should surround string with single quotes", () => {
      const result = StockTradeUtil.getStringSurroundedByQuotes("hello");
      expect(result).toBe("'hello'");
    });
  });

  describe("getMySQLDateStringFromDatetime", () => {
    it("should format datetime to MySQL date string", () => {
      const datetime = new Date("2024-01-15T12:00:00Z").getTime();
      const result = StockTradeUtil.getMySQLDateStringFromDatetime(datetime);
      expect(result).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/);
    });
  });

  describe("assignProperties", () => {
    it("should copy properties from child to parent, excluding timeSinceEntry", () => {
      const parentData = {
        test: { AAPL: 100 },
        timeSinceEntry: { AAPL: 5 },
        percentGain: { AAPL: 50 },
      };
      const childData = {
        test: { AAPL: 0 },
        timeSinceEntry: { AAPL: 0 },
        percentGain: { AAPL: 0 },
      };
      StockTradeUtil.assignProperties(parentData, childData);
      expect(childData.test.AAPL).toBe(100);
      expect(childData.timeSinceEntry.AAPL).toBe(0);
      expect(childData.percentGain.AAPL).toBe(0);
    });

    it("should not overwrite percentGain", () => {
      const parentData = {
        percentGain: { AAPL: 50 },
      };
      const childData = {
        percentGain: { AAPL: 0 },
      };
      StockTradeUtil.assignProperties(parentData, childData);
      expect(childData.percentGain.AAPL).toBe(0);
    });
  });
});
