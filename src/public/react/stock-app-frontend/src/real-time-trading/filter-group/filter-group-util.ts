import { IFilter } from "../../shared/types";
import { missingParams } from "./filter-variables";

export const FilterGroupUtil = {
  /** The first problem with the filters, or "" if the engine will accept them. */
  validate: function (filters: IFilter[]) {
    for (const filter of filters) {
      if (
        !filter.varName ||
        !filter.operator ||
        (!filter.compareVal && !filter.compareVar)
      ) {
        return "Must fill in the variable name, operator, and compare value";
      }
      const missing = missingParams(filter, filter.varName);
      if (missing.length) {
        return `${filter.varName}: fill in ${missing.join(", ")}`;
      }
      if (filter.compareVar) {
        const missingCompare = missingParams(filter, filter.compareVar, true);
        if (missingCompare.length) {
          return `${filter.compareVar} (compare): fill in ${missingCompare.join(", ")}`;
        }
      } else if (!Number.isFinite(parseFloat(filter.compareVal))) {
        return "Must fill in a valid compare value";
      }
    }
    return "";
  },
};
