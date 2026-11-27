import { FilterGroup } from "../../../shared/classes/filter-group";
import { PeriodType } from "../../../shared/constants";
import { IFilter } from "../../../types/strategy-types";

const group = (...filters: IFilter[]) =>
  new FilterGroup({ filters, connectors: filters.slice(1).map(() => "and") }, PeriodType.MINUTE);

const pct = (operator: string, compareVal: string): IFilter => ({
  operator,
  varName: "percentchange",
  timeAgo: "1",
  compareVal,
});

describe("FilterGroup", () => {
  describe("run", () => {
    it("reads each filter's value under its engine key", () => {
      expect(group(pct("=", "10")).run({ percentchange1: { AAPL: 10 } }, "AAPL")).toBe(true);
      expect(group(pct("=", "10")).run({ percentchange1: { AAPL: 5 } }, "AAPL")).toBe(false);
    });

    it("compares against a decimal constant", () => {
      expect(group(pct(">", "10.5")).run({ percentchange1: { AAPL: 10.25 } }, "AAPL")).toBe(false);
      expect(group(pct(">", "10.5")).run({ percentchange1: { AAPL: 10.75 } }, "AAPL")).toBe(true);
    });

    it("ands filters together", () => {
      const g = group(pct(">", "1"), { operator: "<", varName: "rsi", timeAgo: "14", compareVal: "30" });
      expect(g.run({ percentchange1: { AAPL: 2 }, rsi14: { AAPL: 20 } }, "AAPL")).toBe(true);
      expect(g.run({ percentchange1: { AAPL: 2 }, rsi14: { AAPL: 40 } }, "AAPL")).toBe(false);
    });

    it("compares against a compare variable times its coefficient", () => {
      const g = group({
        operator: "<",
        varName: "percentchange",
        timeAgo: "1",
        compareVal: "",
        compareVar: "rsi",
        compareVarTimeAgo: "120",
        compareVarCoefficient: "2",
      });
      expect(g.run({ percentchange1: { AAPL: 5 }, rsi120: { AAPL: 3 } }, "AAPL")).toBe(true);
      expect(g.run({ percentchange1: { AAPL: 7.2 }, rsi120: { AAPL: 3.66 } }, "AAPL")).toBe(true);
      expect(g.run({ percentchange1: { AAPL: 8 }, rsi120: { AAPL: 3 } }, "AAPL")).toBe(false);
    });

    it("a compare variable that isn't known yet fails instead of comparing against compareVal", () => {
      const g = group({ operator: "<", varName: "percentchange", timeAgo: "1", compareVal: "100", compareVar: "priceSma", compareVarTimeAgo: "20" });
      expect(g.run({ percentchange1: { AAPL: 5 }, priceSma20: { AAPL: NaN } }, "AAPL")).toBe(false);
    });

    it("lists the variables its filters read", () => {
      const g = group({ operator: "<", varName: "percentchange", timeAgo: "1", compareVal: "", compareVar: "priceSma", compareVarTimeAgo: "20" });
      expect(g.getVariables().map((v) => v.name)).toEqual(["percentchange1", "priceSma20"]);
    });
  });

  describe("resolveOperator", () => {
    const filterGroup = group(pct("=", "10"));
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
