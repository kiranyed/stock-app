import { IFilterData } from "../../types/data-processing-types";
import {
  IScreener,
  IFilter,
  IFilterGroupPair,
  IFlagFilterGroupPair,
} from "../../types/strategy-types";
import { FilterGroup } from "./filter-group";
import { resolveFilterVariables } from "../utilities/filter-variable-resolver";

/* the screener runs the logic for determining whether to buy or sell, given new data */
export class Screener {
  private buyFilters: FilterGroup = new FilterGroup({
    filters: [],
    connectors: [],
  });
  private sellFilters: FilterGroup = new FilterGroup({
    filters: [],
    connectors: [],
  });
  private shortFilters: FilterGroup = new FilterGroup({
    filters: [],
    connectors: [],
  });
  private coverFilters: FilterGroup = new FilterGroup({
    filters: [],
    connectors: [],
  });
  buySellFilters: IFilterGroupPair = {
    enter: { filters: [], connectors: [] },
    exit: { filters: [], connectors: [] },
  };
  shortCoverFilters: IFilterGroupPair = {
    enter: { filters: [], connectors: [] },
    exit: { filters: [], connectors: [] },
  };
  flags: IFlagFilterGroupPair[] = [];
  constructor(screener: IScreener) {
    if (screener.flags) {
      this.flags = screener.flags;
    }
    if (screener.buySellFilters) {
      this.buySellFilters = screener.buySellFilters;
    }
    if (screener.shortCoverFilters) {
      this.shortCoverFilters = screener.shortCoverFilters;
    }
    if (screener.buySellFilters) {
      this.buyFilters = new FilterGroup(screener.buySellFilters.enter);
      this.sellFilters = new FilterGroup(screener.buySellFilters.exit);
    }
    if (screener.shortCoverFilters) {
      this.shortFilters = new FilterGroup(screener.shortCoverFilters.enter);
      this.coverFilters = new FilterGroup(screener.shortCoverFilters.exit);
    }
  }

  hasFlags() {
    return this.flags.length > 0;
  }

  getFlags() {
    return this.flags;
  }

  hasBuySellFilters() {
    return this.buyFilters.filters.length && this.sellFilters.filters.length;
  }

  hasShortCoverFilters() {
    return this.shortFilters.filters.length && this.coverFilters.filters.length;
  }

  getAllVariables() {
    const variables = new Array<string>();
    const filters = this.getAllFilters();
    for (const filter of filters) {
      variables.push(...resolveFilterVariables(filter));
    }
    return variables;
  }

  getAllFilters() {
    const filters = new Array<IFilter>();
    if (this.hasBuySellFilters()) {
      filters.push(...this.buyFilters.filters);
      filters.push(...this.sellFilters.filters);
    }
    if (this.hasShortCoverFilters()) {
      filters.push(...this.shortFilters.filters);
      filters.push(...this.coverFilters.filters);
    }
    return filters;
  }

  runBuyFilters(filterData: IFilterData, symbol: string) {
    return this.buyFilters.run(filterData, symbol);
  }

  runShortFilters(filterData: IFilterData, symbol: string) {
    return this.shortFilters.run(filterData, symbol);
  }

  runSellFilters(filterData: IFilterData, symbol: string) {
    return this.sellFilters.run(filterData, symbol);
  }

  runCoverFilters(filterData: IFilterData, symbol: string) {
    return this.coverFilters.run(filterData, symbol);
  }
}
