import { IFilterData } from "../../types/data-processing-types";
import {
  IScreener,
  IFilter,
  IFilterGroupPair,
  IFlagFilterGroupPair,
} from "../../types/strategy-types";
import { FilterGroup } from "./filter-group";
import { PeriodType } from "../constants";
import { FilterVariable } from "../../engine/filter-specs";

const EMPTY = { filters: [], connectors: [] };

/* the screener runs the logic for determining whether to buy or sell, given new data */
export class Screener {
  private buyFilters: FilterGroup;
  private sellFilters: FilterGroup;
  private shortFilters: FilterGroup;
  private coverFilters: FilterGroup;
  buySellFilters: IFilterGroupPair = {
    enter: { filters: [], connectors: [] },
    exit: { filters: [], connectors: [] },
  };
  shortCoverFilters: IFilterGroupPair = {
    enter: { filters: [], connectors: [] },
    exit: { filters: [], connectors: [] },
  };
  flags: IFlagFilterGroupPair[] = [];
  constructor(screener: IScreener, period: PeriodType) {
    this.buyFilters = new FilterGroup(EMPTY, period);
    this.sellFilters = new FilterGroup(EMPTY, period);
    this.shortFilters = new FilterGroup(EMPTY, period);
    this.coverFilters = new FilterGroup(EMPTY, period);
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
      this.buyFilters = new FilterGroup(screener.buySellFilters.enter, period);
      this.sellFilters = new FilterGroup(screener.buySellFilters.exit, period);
    }
    if (screener.shortCoverFilters) {
      this.shortFilters = new FilterGroup(screener.shortCoverFilters.enter, period);
      this.coverFilters = new FilterGroup(screener.shortCoverFilters.exit, period);
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

  getVariables(): FilterVariable[] {
    const groups = [];
    if (this.hasBuySellFilters()) groups.push(this.buyFilters, this.sellFilters);
    if (this.hasShortCoverFilters()) groups.push(this.shortFilters, this.coverFilters);
    return groups.flatMap((g) => g.getVariables());
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
