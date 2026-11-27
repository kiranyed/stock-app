import { describe, expect, it } from "@jest/globals";
import { filterVariables, POSITION_VARIABLES } from "../../engine/filter-specs";
import { VARIABLES, variableCatalog } from "../../engine/variable-catalog";
import { PeriodType } from "../../shared/constants";
import { IFilter } from "../../types/strategy-types";

/** A filter on `varName` with every listed param set to its example (or only the required ones). */
const filterFor = (varName: string, which: "all" | "required"): IFilter => {
  const info = VARIABLES.find((v) => v.varName === varName)!;
  const params = Object.fromEntries(
    info.params.filter((p) => which === "all" || p.required).map((p) => [p.name, p.example]),
  );
  return { varName, operator: ">", compareVal: "0", ...params } as IFilter;
};

const names = VARIABLES.map((v) => v.varName);

describe("variable catalog", () => {
  it("lists each variable once", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(names)("%s loads with every param set", (varName) => {
    expect(() => filterVariables(filterFor(varName, "all"), PeriodType.THIRTY_MINUTES)).not.toThrow();
  });

  it.each(names)("%s loads with only its required params", (varName) => {
    expect(() => filterVariables(filterFor(varName, "required"), PeriodType.THIRTY_MINUTES)).not.toThrow();
  });

  it.each(
    VARIABLES.flatMap((v) => v.params.filter((p) => p.required).map((p) => [v.varName, p.name] as const)),
  )("%s without %s is rejected", (varName, paramName) => {
    const filter = filterFor(varName, "required") as unknown as Record<string, unknown>;
    delete filter[paramName];
    expect(() => filterVariables(filter as unknown as IFilter, PeriodType.THIRTY_MINUTES)).toThrow();
  });

  it.each(VARIABLES.flatMap((v) => v.params.filter((p) => p.values).map((p) => [v.varName, p] as const)))(
    "%s accepts each listed value of its param",
    (varName, p) => {
      for (const value of p.values!) {
        const filter = { ...filterFor(varName, "all"), [p.name]: String(value) };
        expect(() => filterVariables(filter, PeriodType.THIRTY_MINUTES)).not.toThrow();
      }
    },
  );

  it("marks exactly the position variables as position", () => {
    const position = VARIABLES.filter((v) => v.kind === "position").map((v) => v.varName);
    expect(new Set(position)).toEqual(POSITION_VARIABLES);
  });

  it("does not list variables the engine rejects", () => {
    expect(names).not.toContain("adx");
    expect(names).not.toContain("volumechange");
  });

  it("gives a filter example the engine accepts", () => {
    const { example } = variableCatalog().filter;
    expect(() => filterVariables(example as IFilter, PeriodType.DAY)).not.toThrow();
  });
});
