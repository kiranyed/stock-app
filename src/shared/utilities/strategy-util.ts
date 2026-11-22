import { CONSTANTS, PeriodType } from "../constants";
import {
  IStockScreenerJob,
  IStockData,
  IStockDataBackTest,
} from "../../types/data-processing-types";
import {
  IAdxFilter,
  IBollingerBandsFilter,
  IFilter,
  IMTSIFilter,
  IRSIFilter,
} from "../../types/strategy-types";

export class StrategyUtil {
  static getAllTimePeriods(jobs: IStockScreenerJob[]): PeriodType[] {
    const periods = jobs.flatMap((job) => [
      job.getPeriod(),
      ...job.getAdditionalPeriods(),
    ]);
    return Array.from(new Set(periods));
  }

  static getAllBackTestNames(twoDArr: string[][]) {
    const names = twoDArr;
    const namesArr = [];
    for (const arr of names) {
      namesArr.push(...arr);
    }
    return this.filterForDups(namesArr);
  }

  static isPeriodType(period: number): period is PeriodType {
    return CONSTANTS.PERIODS.includes(period);
  }

  static filterForDups(arr: string[]) {
    return arr.filter((val, idx) => arr.indexOf(val) === idx);
  }

  static isBollingerBandsFilter(
    filter: IFilter,
  ): filter is IBollingerBandsFilter {
    return filter.varName.includes("bollingerBands");
  }

  static isRsiFilter(filter: IFilter): filter is IRSIFilter {
    return filter.varName.includes("rsi");
  }

  static isAdxFilter(filter: IFilter): filter is IAdxFilter {
    return filter.varName.includes("adx");
  }

  public static convertToVariableName(filter: IFilter) {
    let retVal = ("" + filter.varName).replace(/ /g, "");
    if (filter.varName === "pricePercentChangePercentile") {
      const period = Number(filter.timeAgo ?? 0);
      const sessions = Number(filter.numberOfSessions ?? 20);
      return `pricePercentChange${period}PercentileSessions${sessions}`;
    }
    if (
      ["percentchange", "priceEma", "priceSma", "rsi"].includes(
        filter.varName,
      ) &&
      filter.timeAgo
    ) {
      retVal += filter.timeAgo;
    } else if (this.isMtsiFilter(filter)) {
      return `${filter.varName}M${filter.emaPeriod1}N${filter.emaPeriod2}Vwap${filter.vwapPeriod}`;
    } else if (this.isBollingerBandsFilter(filter)) {
      retVal += filter.period + "Multiplier" + filter.multiplier;
    } else if (this.isRsiFilter(filter)) {
      retVal += filter.period;
    } else if (this.isAdxFilter(filter)) {
      retVal += filter.period + "Threshold" + filter.threshold;
    }
    return retVal;
  }

  public static isMtsiFilter(filter: IFilter): filter is IMTSIFilter {
    return filter.varName.includes("mtsi");
  }

  public static convertToCompareVarName(filter: IFilter) {
    let retVal = ("" + filter.compareVar).replace(/ /g, "");
    if (filter.compareVar === "pricePercentChangePercentile") {
      const period = Number(filter.compareVarTimeAgo ?? 0);
      const sessions = Number(filter.numberOfSessions ?? 20);
      return `pricePercentChange${period}PercentileSessions${sessions}`;
    }
    if (
      filter.compareVar &&
      ["percentchange", "priceEma", "priceSma", "rsi"].includes(
        filter.compareVar,
      ) &&
      filter.compareVarTimeAgo
    ) {
      retVal += filter.compareVarTimeAgo;
    }
    return retVal;
  }

  public static extractTimeAgo(key: string) {
    const match = key.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }

  public static isStockDataBackTest(
    item: IStockData,
  ): item is IStockDataBackTest {
    return "low" in item && "high" in item;
  }
}
