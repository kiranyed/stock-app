import { CONSTANTS, PeriodType } from "../constants";
import {
  IStockData,
  IStockDataBackTest,
} from "../../types/data-processing-types";

export class StrategyUtil {
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

  public static isStockDataBackTest(
    item: IStockData,
  ): item is IStockDataBackTest {
    return "low" in item && "high" in item;
  }
}
