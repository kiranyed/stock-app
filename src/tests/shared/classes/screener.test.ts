import { Screener } from "../../../shared/classes/screener";
import { PeriodType } from "../../../shared/constants";
import { IFilter, IScreener } from "../../../types/strategy-types";

const f = (varName: string, extra: object = {}): IFilter =>
  ({ varName, operator: ">", compareVal: "0", ...extra }) as IFilter;

describe("Screener", () => {
  const screener: IScreener = {
    buySellFilters: {
      enter: { filters: [f("rsi", { timeAgo: "14" }), f("macd", { fastPeriod: 12, slowPeriod: 26 })], connectors: ["and"] },
      exit: { filters: [f("percentGain")], connectors: [] },
    },
    shortCoverFilters: {
      enter: { filters: [f("priceEma", { timeAgo: "5" })], connectors: [] },
      exit: { filters: [], connectors: [] }, // no exit: short/cover side is unused
    },
  };

  it("lists the variables of every filter in use; dependencies are the engine's business", () => {
    const names = new Screener(screener, PeriodType.MINUTE).getVariables().map((v) => v.name);
    expect(names).toEqual(["rsi14", "macdFast12Slow26", "percentGain"]);
  });

  it("position variables have no engine spec", () => {
    const vars = new Screener(screener, PeriodType.MINUTE).getVariables();
    expect(vars.find((v) => v.name === "percentGain")?.spec).toBeUndefined();
    expect(vars.find((v) => v.name === "rsi14")?.spec).toEqual({ kind: "rsi", bars: 14 });
  });

  it("getAllFilters returns the filters of the sides in use", () => {
    expect(new Screener(screener, PeriodType.MINUTE).getAllFilters().map((x) => x.varName)).toEqual(["rsi", "macd", "percentGain"]);
  });

  it("rejects a filter the engine can't compute when it's built", () => {
    expect(() => new Screener({ buySellFilters: { enter: { filters: [f("adx", { timeAgo: "14" })], connectors: [] }, exit: { filters: [], connectors: [] } } }, PeriodType.MINUTE)).toThrow(/Unsupported variable "adx"/);
  });
});
