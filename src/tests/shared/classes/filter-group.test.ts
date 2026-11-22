import { FilterGroup } from "../../../shared/classes/filter-group";
import { StrategyUtil } from "../../../shared/utilities/strategy-util";
import { IFilterGroup } from "../../../types/strategy-types";

jest.mock("../../../shared/utilities/strategy-util");

describe("FilterGroup", () => {
  let filterGroup: FilterGroup;
  let mockFilterGroup: IFilterGroup;

  beforeEach(() => {
    mockFilterGroup = {
      filters: [
        {
          operator: "=",
          varName: "percentchange",
          timeAgo: "1",
          compareVal: "10",
        },
      ],
      connectors: [],
    };

    filterGroup = new FilterGroup(mockFilterGroup);
  });

  describe("run", () => {
    it("should run the filter group and return true if all filters pass", () => {
      const mockData = { percentchange1: { AAPL: 10 } };
      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");
      const result = filterGroup.run(mockData, "AAPL");

      expect(result).toBe(true);
    });

    it("should run the filter group and return false if any filter fails", () => {
      const mockData = { percentchange1: { AAPL: 5 } };
      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");

      jest.spyOn(filterGroup, "evaluateExpression").mockReturnValue(false);

      const result = filterGroup.run(mockData, "AAPL");

      expect(result).toBe(false);
    });
  });

  describe("evaluateExpression", () => {
    it("should evaluate the expression and return true if the condition is met", () => {
      const mockData = { percentchange1: { AAPL: 10 } };
      const filter = {
        operator: "=",
        varName: "percentchange",
        timeAgo: "1",
        compareVal: "10",
      };

      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");

      const result = filterGroup.evaluateExpression(filter, "AAPL", mockData);

      expect(result).toBe(true);
    });

    it("should evaluate the expression with decimal compareVal", () => {
      const filter = {
        operator: ">",
        varName: "percentchange",
        timeAgo: "1",
        discriminator: "",
        compareVal: "10.5",
      };
      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");

      const result = filterGroup.evaluateExpression(filter, "AAPL", {
        percentchange1: { AAPL: 10.25 },
      });

      expect(result).toBe(false);
    });

    it("should evaluate the expression and return false if the condition is not met", () => {
      const filter = {
        operator: "=",
        varName: "percentchange",
        timeAgo: "1",
        discriminator: "",
        compareVal: "10",
      };
      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");

      const result = filterGroup.evaluateExpression(filter, "AAPL", {
        percentchange1: { AAPL: 5 },
      });

      expect(result).toBe(false);
    });

    it("should evaluate the expression containing a compare variable", () => {
      const filter = {
        operator: "<",
        varName: "percentchange",
        timeAgo: "1",
        discriminator: "",
        compareVal: "",
        compareVar: "rsi",
        compareVarTimeAgo: "120",
        compareVarCoefficient: "2",
      };
      StrategyUtil.convertToVariableName = jest
        .fn()
        .mockReturnValue("percentchange1");
      StrategyUtil.convertToCompareVarName = jest
        .fn()
        .mockReturnValue("rsi120");

      const result = filterGroup.evaluateExpression(filter, "AAPL", {
        percentchange1: { AAPL: 5 },
        rsi120: { AAPL: 3 },
      });

      expect(result).toBe(true);

      const result2 = filterGroup.evaluateExpression(filter, "AAPL", {
        percentchange1: { AAPL: 7.2 },
        rsi120: { AAPL: 3.66 },
      });
      expect(result2).toBe(true);
    });
  });

  describe("resolveOperator", () => {
    it("should resolve the operator and return true for equality", () => {
      const op1 = 10;
      const op2 = 10;
      const operator = "=";

      const result = filterGroup.resolveOperator(op1, op2, operator);

      expect(result).toBe(true);
    });

    it("should resolve the operator and return false for inequality", () => {
      const op1 = 10;
      const op2 = 5;
      const operator = "==";

      const result = filterGroup.resolveOperator(op1, op2, operator);

      expect(result).toBe(false);
    });

    it("should resolve the operator and return true for greater than", () => {
      const op1 = 10;
      const op2 = 5;
      const operator = ">";

      const result = filterGroup.resolveOperator(op1, op2, operator);

      expect(result).toBe(true);
    });

    it("should resolve the operator and return false for less than", () => {
      const op1 = 5;
      const op2 = 10;
      const operator = "<";

      const result = filterGroup.resolveOperator(op1, op2, operator);

      expect(result).toBe(true);
    });
  });
});
