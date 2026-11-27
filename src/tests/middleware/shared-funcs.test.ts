import { Request } from "express";
import {
  checkAndGetUserId,
  getUserIdFromRequest,
  userIdCheck,
  isString,
  isInteger,
  isLike,
  isArray,
  isFilter,
  validateFilter,
  checkFilters,
  validateDateRange,
  ALL_OPERATORS,
} from "../../middleware/shared-funcs";
import Error400 from "../../errors/error-400";
import { AuthenticatedRequest } from "../../types/middleware-types";
import { IFilter } from "../../types/strategy-types";

describe("shared-funcs", () => {
  describe("userIdCheck", () => {
    it("should pass for valid user-id in headers", () => {
      const req = {
        headers: {
          "user-id": "123",
        },
      } as AuthenticatedRequest;
      expect(() => userIdCheck(req)).not.toThrow();
    });

    it("should throw Error400 if user-id is missing", () => {
      const req = {
        headers: {},
      } as Request;
      expect(() => userIdCheck(req)).toThrow(Error400);
      expect(() => userIdCheck(req)).toThrow("userId is missing");
    });

    it("should throw Error400 if user-id is an array", () => {
      const req = {
        headers: {
          "user-id": ["123", "456"],
        },
      };
      expect(() => userIdCheck(req as unknown as Request)).toThrow(Error400);
      expect(() => userIdCheck(req as unknown as Request)).toThrow(
        "userId is missing",
      );
    });
  });

  describe("getUserIdFromRequest", () => {
    it("should return userId as a number", () => {
      const req = {
        headers: {
          "user-id": "123",
        },
      } as AuthenticatedRequest;
      expect(getUserIdFromRequest(req)).toBe(123);
    });

    it("should parse string userId to number", () => {
      const req = {
        headers: {
          "user-id": "456",
        },
      } as AuthenticatedRequest;
      expect(getUserIdFromRequest(req)).toBe(456);
    });
  });

  describe("checkAndGetUserId", () => {
    it("should check and return userId", () => {
      const req = {
        headers: {
          "user-id": "789",
        },
      };
      expect(checkAndGetUserId(req as AuthenticatedRequest)).toBe(789);
    });

    it("should throw if userId is missing", () => {
      const req = {
        headers: {},
      } as AuthenticatedRequest;
      expect(() => checkAndGetUserId(req)).toThrow(Error400);
    });
  });

  describe("isString", () => {
    it("should return true for strings", () => {
      expect(isString("hello")).toBe(true);
      expect(isString("")).toBe(true);
      expect(isString("123")).toBe(true);
    });

    it("should return false for non-strings", () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe("isInteger", () => {
    it("should return true for numeric strings", () => {
      expect(isInteger("123")).toBe(true);
      expect(isInteger("0")).toBe(true);
      expect(isInteger("-5")).toBe(true);
    });

    it("should return false for non-numeric strings", () => {
      expect(isInteger("abc")).toBe(false);
      expect(isInteger("")).toBe(false);
      expect(isInteger("12.5")).toBe(false); // parseInt parses this successfully
    });
  });

  describe("isLike", () => {
    it("should return true for objects", () => {
      expect(isLike({})).toBe(true);
      expect(isLike({ key: "value" })).toBe(true);
    });

    it("should return false for non-objects", () => {
      expect(isLike(null)).toBe(false);
      expect(isLike(undefined)).toBe(false);
      expect(isLike("string")).toBe(false);
      expect(isLike(123)).toBe(false);
    });
  });

  describe("isArray", () => {
    it("should return true for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(["a", "b"])).toBe(true);
    });

    it("should return false for non-arrays", () => {
      expect(isArray({})).toBe(false);
      expect(isArray("string")).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe("isFilter", () => {
    it("should return true for valid IFilter objects", () => {
      const filter = {
        varName: "priceSma",
        operator: ">",
        compareVal: "100",
      };
      expect(isFilter(filter)).toBe(true);
    });

    it("should return false for objects missing required properties", () => {
      expect(isFilter({ varName: "test" })).toBe(false);
      expect(isFilter({ operator: ">" })).toBe(false);
      expect(isFilter({ compareVal: "100" })).toBe(false);
    });

    it("should return false for non-objects", () => {
      expect(isFilter(null)).toBe(false);
      expect(isFilter("string")).toBe(false);
      expect(isFilter(123)).toBe(false);
    });
  });

  describe("validateFilter", () => {
    it("should validate a filter with valid varName", () => {
      const filter: IFilter = {
        varName: "priceSma",
        operator: ">",
        compareVal: "100",
      };
      expect(() => validateFilter(filter)).not.toThrow();
    });

    it("should throw Error400 for invalid varName", () => {
      const filter: IFilter = {
        varName: "invalidVar",
        operator: ">",
        compareVal: "100",
      };
      expect(() => validateFilter(filter)).toThrow(Error400);
      expect(() => validateFilter(filter)).toThrow(
        /varName must be one of the following values/,
      );
    });

    it("should throw Error400 for invalid operator", () => {
      const filter: IFilter = {
        varName: "priceSma",
        operator: "!=",
        compareVal: "100",
      };
      expect(() => validateFilter(filter)).toThrow(Error400);
      expect(() => validateFilter(filter)).toThrow(
        /operator must be one of the following values/,
      );
    });

    it("should throw Error400 for invalid compareVal", () => {
      const filter: IFilter = {
        varName: "priceSma",
        operator: ">",
        compareVal: "100@#$",
      };
      expect(() => validateFilter(filter)).toThrow(Error400);
      expect(() => validateFilter(filter)).toThrow(
        /compareVal must be either a number or a string consisting of only letters/,
      );
    });

    it("should validate percentchange filter with timeAgo", () => {
      const filter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
        timeAgo: "10",
      };
      expect(() => validateFilter(filter)).not.toThrow();
    });

    it("should throw Error400 for percentchange without timeAgo", () => {
      const filter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
      };
      expect(() => validateFilter(filter)).toThrow(Error400);
      expect(() => validateFilter(filter)).toThrow(
        new Error400("timeAgo is required for percentchange filter"),
      );
    });

    it("should throw Error400 for percentchange with non-integer timeAgo", () => {
      const filter = {
        varName: "percentchange",
        operator: ">",
        compareVal: "5",
        timeAgo: "abc",
      };
      expect(() => validateFilter(filter)).toThrow(Error400);
      expect(() => validateFilter(filter)).toThrow(
        /timeAgo must be an integer/,
      );
    });

    it("should validate compareVal with various numeric formats", () => {
      const validFilters = [
        { varName: "priceSma", operator: ">", compareVal: "100" },
        { varName: "priceSma", operator: ">", compareVal: "-50" },
        { varName: "priceSma", operator: ">", compareVal: "12.5" },
        { varName: "priceSma", operator: ">", compareVal: "abc" },
      ];

      validFilters.forEach((filter) => {
        expect(() => validateFilter(filter as IFilter)).not.toThrow();
      });
    });

    it("should validate all valid operators", () => {
      const operators = [">", ">=", "<", "<=", "="];
      operators.forEach((operator) => {
        const filter: IFilter = {
          varName: "priceSma",
          operator,
          compareVal: "100",
        };
        expect(() => validateFilter(filter)).not.toThrow();
      });
    });

    it("should validate all valid varNames", () => {
      const varNames = [
        "priceSma",
        "volumeSma",
        "priceEma",
        "percentGain",
        "timeSinceEntry",
        "volumeChange",
        "mtsi",
        "tsi",
        "macd",
        "macdCrossover",
        "rsi",
        "rsiCrossover",
        "macdDivergence",
        "rsiDivergence",
        "adx",
        "bollingerbands",
        "priceema",
        "pricesma",
        "vwap",
      ];

      varNames.forEach((varName) => {
        const filter: IFilter = {
          varName,
          operator: ">",
          compareVal: "100",
        };
        expect(() => validateFilter(filter)).not.toThrow();
      });
    });
    it("shoudl throw Error400 for invalid operators in filters", () => {
      const filters = [
        { varName: "priceSma", operator: "==", compareVal: "100" },
        { varName: "volumeSma", operator: "<<", compareVal: "1000" },
      ];
      expect(() => validateFilter(filters[0])).toThrow(Error400);
      expect(() => validateFilter(filters[1])).toThrow(
        new RegExp(
          `operator must be one of the following values: ${ALL_OPERATORS.join(", ")}`,
        ),
      );
    });
  });

  describe("checkFilters", () => {
    it("should return true for valid array of filters", () => {
      const filters = [
        { varName: "priceSma", operator: ">=", compareVal: "100" },
        { varName: "volumeSma", operator: "<=", compareVal: "1000" },
      ];
      expect(checkFilters(filters)).toBe(true);
    });

    it("should throw Error400 if filters is not an array", () => {
      expect(() => checkFilters("not-array")).toThrow(Error400);
      expect(() => checkFilters("not-array")).toThrow(
        "filters must be an array",
      );
    });

    it("should throw Error400 for invalid filter in array", () => {
      const filters = [
        { varName: "priceSma", operator: ">", compareVal: "100" },
        { invalid: "object" },
      ];
      expect(() => checkFilters(filters)).toThrow(Error400);
      expect(() => checkFilters(filters)).toThrow(
        /Entry at position \d+ is not of type IFilter/,
      );
    });

    it("should handle empty array", () => {
      expect(checkFilters([])).toBe(true);
    });
  });

  describe("validateDateRange", () => {
    it("should validate valid date range", () => {
      expect(() => validateDateRange("1000", "2000")).not.toThrow();
    });

    it("should throw Error400 if startTime >= endTime", () => {
      expect(() => validateDateRange("2000", "1000")).toThrow(Error400);
      expect(() => validateDateRange("2000", "1000")).toThrow(
        "startTime must be less than endTime",
      );
    });

    it("should throw Error400 if startTime equals endTime", () => {
      expect(() => validateDateRange("1000", "1000")).toThrow(Error400);
      expect(() => validateDateRange("1000", "1000")).toThrow(
        "startTime must be less than endTime",
      );
    });

    it("should throw Error400 for non-integer startTime", () => {
      expect(() => validateDateRange("abc", "2000")).toThrow(Error400);
      expect(() => validateDateRange("abc", "2000")).toThrow(
        "startTime and endTime must be valid integers",
      );
    });

    it("should throw Error400 for non-integer endTime", () => {
      expect(() => validateDateRange("1000", "xyz")).toThrow(Error400);
      expect(() => validateDateRange("1000", "xyz")).toThrow(
        "startTime and endTime must be valid integers",
      );
    });

    it("should throw Error400 for floating point values", () => {
      expect(() => validateDateRange("100.5", "200")).toThrow(Error400);
      expect(() => validateDateRange("100", "200.5")).toThrow(Error400);
    });
  });
});
