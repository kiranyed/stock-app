import { IFilterGroupPair } from "../../shared/types";

export const ScreenerUtil = {
  validate: function (
    buySellFilters: IFilterGroupPair | undefined,
    shortCoverFilters: IFilterGroupPair | undefined,
  ) {
    let valid = true;
    /* fix this */
    if (!buySellFilters && !shortCoverFilters) {
      return false;
    }
    if (
      buySellFilters &&
      buySellFilters.enter.filters.length === 0 &&
      buySellFilters.exit.filters.length === 0 &&
      shortCoverFilters &&
      shortCoverFilters.enter.filters.length === 0 &&
      shortCoverFilters.exit.filters.length === 0
    ) {
      valid = false;
    }
    if (
      buySellFilters &&
      (buySellFilters.enter.filters.length > 0 ||
        buySellFilters.exit.filters.length > 0)
    ) {
      const bs = buySellFilters;
      if (bs.enter.filters.length > 0 && !(bs.exit.filters.length > 0)) {
        valid = false;
      }
      if (!(bs.enter.filters.length > 0) && bs.exit.filters.length > 0) {
        valid = false;
      }
    }

    if (
      shortCoverFilters &&
      (shortCoverFilters.enter.filters.length > 0 ||
        shortCoverFilters.exit.filters.length > 0)
    ) {
      const sc = shortCoverFilters;
      if (sc.enter.filters.length > 0 && !(sc.exit.filters.length > 0)) {
        valid = false;
      }
      if (!(sc.enter.filters.length > 0) && sc.exit.filters.length > 0) {
        valid = false;
      }
    }
    return valid;
  },
};
