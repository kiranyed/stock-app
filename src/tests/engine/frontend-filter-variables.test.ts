import { describe, expect, it } from "@jest/globals";
import { filterVariables } from "../../engine/filter-specs";
import { PeriodType } from "../../shared/constants";
import { IFilter } from "../../types/strategy-types";
import {
  analysisDataOptions,
  barPeriodOptions,
  entryOptions,
  exitOptions,
  missingParams,
} from "../../public/react/stock-app-frontend/src/real-time-trading/filter-group/filter-variables";

/*
 * The frontend's variable list and its required params must match what the
 * engine accepts: an option the engine can't compute throws when the strategy
 * loads, and a missing required param does too.
 */

/**
 * Values the UI's inputs would write for every param it shows. The `timeAgo`
 * values are also bar periods, since VWAP's period dropdown writes there.
 */
const filled: Record<string, string> = {
  timeAgo: "5",
  compareVarTimeAgo: "10",
  numberOfSessions: "2",
  fastPeriod: "12",
  slowPeriod: "26",
  signalPeriod: "9",
  periodsBefore: "2",
  periodsAfter: "1",
  crossoverLevel: "50",
  period: "14",
  lookback: "10",
  emaPeriod1: "25",
  emaPeriod2: "13",
  vwapPeriod: "5",
  multiplier: "2",
  band: "lower",
  bullish: "false",
};

const base = (extra: Partial<Record<string, string>>): IFilter =>
  ({
    varName: "",
    operator: ">",
    compareVal: "0",
    compareVar: "",
    ...extra,
  }) as unknown as IFilter;

const values = (options: { value: string }[]) => options.map((o) => o.value);

describe("frontend filter variables", () => {
  it.each(values(exitOptions))(
    "%s is computed by the engine when its inputs are filled",
    (varName) => {
      const filter = base({ ...filled, varName });
      expect(missingParams(filter, varName)).toEqual([]);
      expect(() => filterVariables(filter, PeriodType.FIVE_MINUTES)).not.toThrow();
    },
  );

  it.each(values(exitOptions))(
    "%s as a compare variable is computed by the engine",
    (compareVar) => {
      const filter = base({ ...filled, varName: "price", compareVar });
      expect(missingParams(filter, compareVar, true)).toEqual([]);
      expect(() => filterVariables(filter, PeriodType.FIVE_MINUTES)).not.toThrow();
    },
  );

  it.each(values(exitOptions))(
    "%s: the engine throws exactly when the UI says a param is missing",
    (varName) => {
      const filter = base({ varName });
      const missing = missingParams(filter, varName);
      const load = () => filterVariables(filter, PeriodType.FIVE_MINUTES);
      if (missing.length) expect(load).toThrow();
      else expect(load).not.toThrow();
    },
  );

  it("entry options are a subset of exit options, and offer no position variables", () => {
    const exit = new Set(values(exitOptions));
    for (const v of values(entryOptions)) expect(exit.has(v)).toBe(true);
    expect(values(entryOptions)).not.toContain("percentGain");
    expect(values(entryOptions)).not.toContain("timeSinceEntry");
  });

  it("offers neither adx nor volumechange", () => {
    for (const v of ["adx", "volumechange", "volumeChange", "marketcap"]) {
      expect(values(exitOptions)).not.toContain(v);
      expect(values(analysisDataOptions)).not.toContain(v);
    }
  });

  it.each(values(barPeriodOptions))("VWAP accepts a bar period of %s", (p) => {
    const filter = base({ varName: "vwap", timeAgo: p });
    const [v] = filterVariables(filter, PeriodType.THIRTY_MINUTES);
    expect(v.name).toBe(`vwap${p}`);
  });

  it("VWAP with no bar period uses the strategy's period", () => {
    const [v] = filterVariables(base({ varName: "vwap" }), PeriodType.TEN_MINUTES);
    expect(v.name).toBe("vwap10");
  });

  it("volume SMA reads its period", () => {
    const [v] = filterVariables(
      base({ varName: "volumeSma", timeAgo: "20" }),
      PeriodType.DAY,
    );
    expect(v.name).toBe("volumeSma20");
  });
});
