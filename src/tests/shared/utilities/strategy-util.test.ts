import { StrategyUtil } from "../../../shared/utilities/strategy-util";
import { PeriodType } from "../../../shared/constants";
import {
  IStockData,
  IStockDataBackTest,
} from "../../../types/data-processing-types";

describe("StrategyUtil", () => {
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
