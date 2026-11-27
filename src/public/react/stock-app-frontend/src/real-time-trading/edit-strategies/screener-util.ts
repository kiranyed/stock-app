import { IFilterGroupPair, IScreener } from "../../shared/types";
import { InitUtil } from "../../shared/utilities/init-util";

export const ScreenerUtil = {
  /**
   * The screener as the strategy keeps it after Save: copies of its non-empty sides, and its id.
   * The id must survive edits: the server ties open positions to the screener that entered them.
   */
  toSaved(edited: IScreener, id?: string): IScreener {
    const saved = InitUtil.initScreener();
    if (id) saved.id = id;
    if (edited.buySellFilters && InitUtil.isNotEmpty(edited.buySellFilters)) {
      saved.buySellFilters = { ...InitUtil.getDeepCopy(edited.buySellFilters) };
    }
    if (edited.shortCoverFilters && InitUtil.isNotEmpty(edited.shortCoverFilters)) {
      saved.shortCoverFilters = { ...InitUtil.getDeepCopy(edited.shortCoverFilters) };
    }
    return saved;
  },

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
