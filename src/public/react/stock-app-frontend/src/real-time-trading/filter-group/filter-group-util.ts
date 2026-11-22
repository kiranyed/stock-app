import { IFilter, IMTSIFilter } from "../../shared/types";

const isMtsiFilter = (filter: IFilter): filter is IMTSIFilter => {
  return filter.varName.includes("mtsi");
};

export const FilterGroupUtil = {
  validate: function (filters: IFilter[]) {
    let message = "";
    for (const filter of filters) {
      if (
        !filter.varName ||
        !filter.operator ||
        (!filter.compareVal && !filter.compareVar)
      ) {
        message = "Must fill in the variable name, operator, and compare value";
        break;
      }
      if (filter.varName) {
        if (filter.varName.indexOf("percentchange") > -1) {
          if (!filter.timeAgo) {
            message = "Must fill in the time ago value";
            break;
          }
        }

        if (isMtsiFilter(filter)) {
          if (!filter.emaPeriod1 || !filter.emaPeriod2 || !filter.vwapPeriod) {
            message = "Must fill in the EMA periods and VWAP period";
            break;
          }
        }
      }

      if (!parseFloat(filter.compareVal) && !filter.compareVar) {
        message = "Must fill in a valid compare value";
        break;
      }
    }
    return message;
  },
};
