import {
  IFilter,
  IFilterGroup,
  IFilterGroupPair,
  IMTSIFilter,
  IScreener,
  IStrategy,
} from "../types";

export class InitUtil {
  public static getDeepCopy(obj: object) {
    const str = JSON.stringify(obj);
    const newObj = JSON.parse(str);
    return newObj;
  }

  public static initStrategy() {
    return { screeners: new Array<IScreener>(), name: "" }; // inEditMode: true, screenersUnderEdit: new Array<number>() };
  }

  public static initFilter = (): IFilter => ({
    varName: "",
    operator: "",
    compareVal: "",
    compareVar: "",
    discriminator: "I-AM-EXPRESSION",
  });
  public static initFilters = () => [
    { varName: "", operator: "", compareVal: "" },
  ];

  public static isNotEmpty(pair: IFilterGroupPair) {
    let notEmpty = false;
    if (pair.enter.filters.length) {
      notEmpty = true;
    }
    return notEmpty;
  }
  public static initFilterGroup = () => ({
    filters: new Array<IFilter>(),
    connectors: new Array<string>(),
  });

  public static initFilterGroupPair = () => ({
    enter: InitUtil.initFilterGroup(),
    exit: InitUtil.initFilterGroup(),
  });

  public static initScreener(): IScreener {
    return {
      buySellFilters: this.initFilterGroupPair(),
      shortCoverFilters: this.initFilterGroupPair(),
    };
  }

  public static convertStrategyToString(obj: IStrategy) {
    const screeners = obj.screeners;
    let str = "";
    for (let i = 0; i < screeners.length; i++) {
      if (i > 0) {
        str += "\t\t\r\n\r\n";
      }
      str += "Screener" + (i + 1) + ":\t\r\n";
      const screener = screeners[i];
      if (screener.buySellFilters && this.isNotEmpty(screener.buySellFilters)) {
        str +=
          "Buy if " +
          this.convertFilterGroupToString(screener.buySellFilters.enter) +
          "\r\n";
        str +=
          "Sell if " +
          this.convertFilterGroupToString(screener.buySellFilters.exit) +
          "\r\n";
      }
      if (
        screener.shortCoverFilters &&
        this.isNotEmpty(screener.shortCoverFilters)
      ) {
        str +=
          "Short if " +
          this.convertFilterGroupToString(screener.shortCoverFilters.enter) +
          "\r\n";
        str +=
          "Cover if " +
          this.convertFilterGroupToString(screener.shortCoverFilters.exit) +
          "\r\n";
      }
    }
    return str;
  }

  isMtsi(filter: IFilter): filter is IMTSIFilter {
    return filter.varName === "mtsi";
  }

  public static convertFilterVarNameToString(
    varName: string,
    timeAgo?: number,
  ) {
    let str = "";
    switch (varName.toLowerCase()) {
      case "marketcap":
        str += "Market cap";
        break;
      case "timesinceentry":
        str += "Number of time periods since entry";
        break;
      case "mtsi":
        str += "MTSI";
        break;
      case "tsi":
        str += "TSI";
        break;
      case "macdcrossover":
        str += "MACD Crossover";
        break;
      case "rsi":
        str += "RSI";
        break;
      case "rsicrossover":
        str += "RSI Crossover";
        break;
      case "macddivergence":
        str += "MACD Divergence";
        break;
      case "rsidivergence":
        str += "RSI Divergence";
        break;
      case "percentchange":
        str += "Percent change since " + timeAgo! + " periods ago";
        break;
      case "pricepercentchangepercentile":
        str += "Percent change percentile rank";
        break;
      case "volumechange":
        str += "Volume change since " + timeAgo! + " periods ago";
        break;
      case "price":
        str += "Price";
        break;
      case "priceema":
        str += `${timeAgo!}-period EMA of price`;
        break;
      case "primesma":
        str += `${timeAgo!}-period SMA of price`;
        break;
      case "bollingerbands":
        str += `Bollinger Bands (${timeAgo!} periods)`;
        break;
      case "vwap":
        str += "VWAP";
        break;
      case "volumeSma":
        str += `${timeAgo!}-period SMA of volume`;
        break;
      case "percentgain":
        str += "Percent gain since purchase";
        break;
      default:
        str += "Unknown filter";
    }
    return str;
  }

  public static convertFilterGroupToString = (
    filterGroup: IFilterGroup | null,
  ) => {
    if (filterGroup === null) {
      return "";
    }
    let string = "";
    const filters = filterGroup.filters;
    for (let i = 0; i < filters.length; i++) {
      if (i > 0) {
        string += " " + filterGroup.connectors[i - 1];
      }
      const obj = filters[i];
      const compareVar = obj.compareVar ?? "";
      const timeAgo = obj.timeAgo ? Number(obj.timeAgo) : undefined;
      const compareVarTimeAgo = obj.compareVarTimeAgo
        ? Number(obj.compareVarTimeAgo)
        : undefined;
      string +=
        obj.varName.includes("Crossover") || obj.varName.includes("Divergence")
          ? InitUtil.convertFilterVarNameToString(obj.varName, timeAgo)
          : " " +
            InitUtil.convertFilterVarNameToString(obj.varName, timeAgo) +
            (obj.varName === "pricePercentChangePercentile"
              ? ` (sessions: ${obj.numberOfSessions || "20"})`
              : "") +
            " " +
            obj.operator +
            " " +
            (obj.compareVal ||
              `${obj.compareVarCoefficient} x ${InitUtil.convertFilterVarNameToString(compareVar, compareVarTimeAgo)}`);
    }
    return string;
  };

  public static convertToVariableName(filter: IFilter) {
    let retVal = ("" + filter.varName).replace(/ /g, "");
    if (filter.timeAgo) {
      retVal += "since" + filter.timeAgo;
    }
    return retVal;
  }

  public static convertToCompareVarName(filter: IFilter) {
    let retVal = ("" + filter.compareVar).replace(/ /g, "");
    if (filter.compareVarTimeAgo) {
      retVal += "since" + filter.compareVarTimeAgo;
    }
    return retVal;
  }

  public static arraysAreEqual = (array1: number[], array2: number[]) => {
    return (
      array1.length === array2.length &&
      array1.every((value, index) => value === array2[index])
    );
  };
}
