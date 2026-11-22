import { StrategyUtil } from "../../../shared/utilities/strategy-util";
import { PeriodType } from "../../../shared/constants";
import {
  IFilter,
  IAdxFilter,
  IBollingerBandsFilter,
  IRSIFilter,
  IMTSIFilter,
} from "../../../types/strategy-types";
import {
  IStockScreenerJob,
  IStockData,
  IStockDataBackTest,
} from "../../../types/data-processing-types";

describe("StrategyUtil", () => {
  describe("getAllTimePeriods", () => {
    it("should return all unique periods from jobs", () => {
      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: () => PeriodType.MINUTE,
          getAdditionalPeriods: () => [PeriodType.HOUR],
        } as IStockScreenerJob,
        {
          getPeriod: () => PeriodType.HOUR,
          getAdditionalPeriods: () => [PeriodType.DAY],
        } as IStockScreenerJob,
      ];
      const result = StrategyUtil.getAllTimePeriods(mockJobs);
      expect(result).toContain(PeriodType.MINUTE);
      expect(result).toContain(PeriodType.HOUR);
      expect(result).toContain(PeriodType.DAY);
    });

    it("should remove duplicate periods", () => {
      const mockJobs: IStockScreenerJob[] = [
        {
          getPeriod: () => PeriodType.MINUTE,
          getAdditionalPeriods: () => [PeriodType.MINUTE],
        } as IStockScreenerJob,
      ];
      const result = StrategyUtil.getAllTimePeriods(mockJobs);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(PeriodType.MINUTE);
    });
  });

  describe("getAllBackTestNames", () => {
    it("should flatten 2D array", () => {
      const twoDArr = [
        ["test1", "test2"],
        ["test3", "test4"],
      ];
      const result = StrategyUtil.getAllBackTestNames(twoDArr);
      expect(result).toContain("test1");
      expect(result).toContain("test2");
      expect(result).toContain("test3");
      expect(result).toContain("test4");
    });

    it("should remove duplicates", () => {
      const twoDArr = [
        ["test1", "test2"],
        ["test1", "test3"],
      ];
      const result = StrategyUtil.getAllBackTestNames(twoDArr);
      expect(result.length).toBe(3);
      expect(result.filter((name) => name === "test1").length).toBe(1);
    });
  });

  describe("isPeriodType", () => {
    it("should return true for valid period", () => {
      const result = StrategyUtil.isPeriodType(PeriodType.DAY);
      expect(result).toBe(true);
    });

    it("should return false for invalid period", () => {
      const result = StrategyUtil.isPeriodType(9999);
      expect(result).toBe(false);
    });
  });

  describe("filterForDups", () => {
    it("should remove duplicates from array", () => {
      const arr = ["a", "b", "a", "c", "b"];
      const result = StrategyUtil.filterForDups(arr);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should return empty array for empty input", () => {
      const result = StrategyUtil.filterForDups([]);
      expect(result).toEqual([]);
    });
  });

  describe("isBollingerBandsFilter", () => {
    it("should return true for Bollinger Bands filter", () => {
      const filter: IBollingerBandsFilter = {
        varName: "bollingerBandsUpper",
        operator: ">",
        compareVal: "100",
        period: 20,
        multiplier: 2,
        discriminator: "I-AM-EXPRESSION",
      } as IBollingerBandsFilter;
      expect(StrategyUtil.isBollingerBandsFilter(filter)).toBe(true);
    });

    it("should return false for non-Bollinger Bands filter", () => {
      const filter: IFilter = {
        varName: "rsi",
        operator: ">",
        compareVal: "70",
      };
      expect(StrategyUtil.isBollingerBandsFilter(filter)).toBe(false);
    });
  });

  describe("isRsiFilter", () => {
    it("should return true for RSI filter", () => {
      const filter: IRSIFilter = {
        varName: "rsi",
        operator: ">",
        compareVal: "70",
        period: 14,
        discriminator: "I-AM-EXPRESSION",
      } as IRSIFilter;
      expect(StrategyUtil.isRsiFilter(filter)).toBe(true);
    });

    it("should return false for non-RSI filter", () => {
      const filter: IFilter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
      };
      expect(StrategyUtil.isRsiFilter(filter)).toBe(false);
    });
  });

  describe("isAdxFilter", () => {
    it("should return true for ADX filter", () => {
      const filter: IAdxFilter = {
        varName: "adx",
        operator: ">",
        compareVal: "25",
        period: 14,
        threshold: 25,
        discriminator: "I-AM-EXPRESSION",
      } as IAdxFilter;
      expect(StrategyUtil.isAdxFilter(filter)).toBe(true);
    });

    it("should return false for non-ADX filter", () => {
      const filter: IFilter = {
        varName: "rsi",
        operator: ">",
        compareVal: "70",
      };
      expect(StrategyUtil.isAdxFilter(filter)).toBe(false);
    });
  });

  describe("isMtsiFilter", () => {
    it("should return true for MTSI filter", () => {
      const filter: IMTSIFilter = {
        varName: "mtsi",
        operator: ">",
        compareVal: "50",
        emaPeriod1: 12,
        emaPeriod2: 26,
        vwapPeriod: 5,
        discriminator: "I-AM-EXPRESSION",
      } as IMTSIFilter;
      expect(StrategyUtil.isMtsiFilter(filter)).toBe(true);
    });

    it("should return false for non-MTSI filter", () => {
      const filter: IFilter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
      };
      expect(StrategyUtil.isMtsiFilter(filter)).toBe(false);
    });
  });

  describe("convertToVariableName", () => {
    it("should convert percentchange filter with timeAgo", () => {
      const filter: IFilter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
        timeAgo: "60",
      };
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("percentchange60");
    });

    it("should convert priceEma filter with timeAgo", () => {
      const filter: IFilter = {
        varName: "priceEma",
        operator: ">",
        compareVal: "100",
        timeAgo: "50",
      };
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("priceEma50");
    });

    it("should convert MTSI filter", () => {
      const filter: IMTSIFilter = {
        varName: "mtsi",
        operator: ">",
        compareVal: "50",
        emaPeriod1: 12,
        emaPeriod2: 26,
        vwapPeriod: 5,
        discriminator: "I-AM-EXPRESSION",
      } as IMTSIFilter;
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("mtsiM12N26Vwap5");
    });

    it("should convert Bollinger Bands filter", () => {
      const filter: IBollingerBandsFilter = {
        varName: "bollingerBandsUpper",
        operator: ">",
        compareVal: "100",
        period: 20,
        multiplier: 2,
        discriminator: "I-AM-EXPRESSION",
      } as IBollingerBandsFilter;
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("bollingerBandsUpper20Multiplier2");
    });

    it("should convert RSI filter", () => {
      const filter: IRSIFilter = {
        varName: "rsi",
        operator: ">",
        compareVal: "70",
        period: 14,
        discriminator: "I-AM-EXPRESSION",
      } as IRSIFilter;
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("rsi14");
    });

    it("should convert ADX filter", () => {
      const filter: IAdxFilter = {
        varName: "adx",
        operator: ">",
        compareVal: "25",
        period: 14,
        threshold: 25,
        discriminator: "I-AM-EXPRESSION",
      } as IAdxFilter;
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("adx14Threshold25");
    });

    it("should handle spaces in varName", () => {
      const filter: IFilter = {
        varName: "price Ema",
        operator: ">",
        compareVal: "100",
        timeAgo: "50",
      };
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).not.toContain(" ");
    });

    it("should not append timeAgo to non-specific compareVar", () => {
      const filter: IFilter = {
        varName: "timeSinceEntry",
        operator: ">",
        compareVal: "5",
        timeAgo: "10",
      };
      const result = StrategyUtil.convertToVariableName(filter);
      expect(result).toBe("timeSinceEntry");
    });
  });

  describe("convertToCompareVarName", () => {
    it("should convert compareVar with timeAgo", () => {
      const filter: IFilter = {
        varName: "test",
        compareVar: "percentchange",
        compareVarTimeAgo: "120",
        operator: ">",
        compareVal: "5",
      };
      const result = StrategyUtil.convertToCompareVarName(filter);
      expect(result).toBe("percentchange120");
    });

    it("should return compareVar without timeAgo if not present", () => {
      const filter: IFilter = {
        varName: "test",
        compareVar: "rsi",
        operator: ">",
        compareVal: "70",
      };
      const result = StrategyUtil.convertToCompareVarName(filter);
      expect(result).toBe("rsi");
    });

    it("should not return timeAgo if compareVar is not one of the specific types", () => {
      const filter: IFilter = {
        varName: "timeSinceEntry",
        compareVar: "price",
        compareVarTimeAgo: "50",
        operator: ">",
        compareVal: "100",
      };
      const result = StrategyUtil.convertToCompareVarName(filter);
      expect(result).toBe("price");
    });
  });

  describe("extractTimeAgo", () => {
    it("should extract time ago from key", () => {
      const result = StrategyUtil.extractTimeAgo("priceEma50");
      expect(result).toBe(50);
    });

    it("should extract multiple digit time ago", () => {
      const result = StrategyUtil.extractTimeAgo("priceEma200");
      expect(result).toBe(200);
    });

    it("should return 0 if no digits at end", () => {
      const result = StrategyUtil.extractTimeAgo("priceEma");
      expect(result).toBe(0);
    });

    it("should extract from complex key", () => {
      const result = StrategyUtil.extractTimeAgo("rsiCrossover60");
      expect(result).toBe(60);
    });
  });

  describe("isStockDataBackTest", () => {
    it("should return true for back test stock data", () => {
      const data: IStockDataBackTest = {
        symbol: "AAPL",
        price: 150,
        volume: 1000,
        datetime: Date.now(),
        low: 149,
        high: 151,
      } as IStockDataBackTest;
      expect(StrategyUtil.isStockDataBackTest(data)).toBe(true);
    });

    it("should return false for non-back test stock data", () => {
      const data: IStockData = {
        symbol: "AAPL",
        price: 150,
        volume: 1000,
        datetime: Date.now(),
      };
      expect(StrategyUtil.isStockDataBackTest(data)).toBe(false);
    });
  });
});
