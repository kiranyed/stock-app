import { ScreenerUtil } from "./screener-util";
import { IScreener } from "../../shared/types";

const group = (varName: string) => ({ filters: [{ varName, operator: ">", compareVal: "1" }], connectors: [] });
const pair = { enter: group("rsi"), exit: group("percentGain") };

describe("ScreenerUtil.toSaved", () => {
  it("keeps the screener's id, so the server can tie its open positions to it", () => {
    const edited = { id: "s1", buySellFilters: pair } as unknown as IScreener;
    expect(ScreenerUtil.toSaved(edited, "s1")).toMatchObject({ id: "s1", buySellFilters: pair });
  });

  it("leaves a new screener without an id for the server to assign, and copies the filters", () => {
    const edited = { buySellFilters: pair } as unknown as IScreener;
    const saved = ScreenerUtil.toSaved(edited);
    expect(saved.id).toBeUndefined();
    expect(saved.buySellFilters).toEqual(pair);
    expect(saved.buySellFilters).not.toBe(pair);
  });
});
