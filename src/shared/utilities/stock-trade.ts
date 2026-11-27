import * as fs from "fs";
import { CONSTANTS, PeriodType } from "../constants";
import { IGainTotal } from "../../types/back-test-types";
import { IFilterData } from "../../types/data-processing-types";
import { IGain } from "../../types/strategy-types";
import { getOffset } from "./time-util";
let EAST_COAST_OFFSET = NaN;

function initOffset() {
  //console.log('initing offset');
  if (!isNaN(EAST_COAST_OFFSET)) {
    return EAST_COAST_OFFSET;
  } else {
    const date = new Date();
    const eastCoastDate = new Date(
      date.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    const date2 = new Date(eastCoastDate.toString());
    EAST_COAST_OFFSET = Math.round(
      (date2.getTime() - date.getTime()) / CONSTANTS.MILLIS_IN_MINUTE,
    );
  }
}

initOffset();

export class StockTradeUtil {
  static formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  /**
     * 
     * @param datetime // Define the formatter once
const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

// Reuse inside loops
const eastCoastDate = new Date(formatter.format(date));
     * @returns 
     */
  /* given a datetime in millis, get the difference in minutes between it and east coast time*/
  public static computeOffset(datetime: number): number {
    const date = new Date(datetime);
    const eastCoastDate = this.getEastCoastDate(date);
    const offset =
      (eastCoastDate.getTime() - date.getTime()) / CONSTANTS.MILLIS_IN_MINUTE;
    return Math.round(offset);
  }

  /* whatever timezone this app is running in (it'll be running in some server in AWS, so it'll probably be a diff
    time zone than east coast, get the difference in minutes between it and the east coast time*/
  public static initOffset() {
    EAST_COAST_OFFSET = getOffset();
    // if (OFFSET) {
    //     return OFFSET;
    // } else {
    //     const date = new Date();
    //     const eastCoastDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    //     const date2 = new Date(eastCoastDate.toString());
    //     OFFSET = Math.round((date2.getTime() - date.getTime()) / CONSTANTS.MILLIS_IN_MINUTE);
    // }
  }

  /* read a file and return its contents*/
  public static async readFile(file: string) {
    return new Promise<string>((resolve, reject) => {
      fs.readFile(file, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.toString());
        }
      });
    });
  }

  /* get the gains for a backtest*/
  public static getGainsNumbers(gains: number[], portfolioSize = 1) {
    let total = 1;
    const ratio = 1 / portfolioSize;
    for (const gain of gains) {
      const adjustedGain = (gain - 1) * ratio + 1;
      total *= adjustedGain;
    }
    const percent = 100 * (total - 1);
    return percent;
  }

  /* same as getGainsNumbers but no percent, only ratio*/
  public static getGainsNumbersNoPercent(gains: number[], portfolioSize = 1) {
    return this.getGainsNumbers(gains, portfolioSize) / 100 + 1;
  }

  /* idk diff between this and above 2*/
  public static getGains(gains: IGain[], portfolioSize = 1) {
    let total = 1;
    const ratio = 1 / portfolioSize;
    for (const gain of gains) {
      const adjustedGain = (gain.gain - 1) * ratio + 1;
      total *= adjustedGain;
    }
    const percent = 100 * (total - 1);
    return percent;
  }

  public static getGainsNoPercent(gains: IGain[], portfolioSize = 1) {
    return this.getGains(gains, portfolioSize) / 100 + 1;
  }

  /* same as getGains, but get more data to analyze.  like each indiivudal positive gain and negative gain on trades.
    and the highest gains and lowest losses */
  public static addGains(gains: IGain[]) {
    const negativeGains = [];
    const positiveGains = [];
    let total = 0;
    for (const gainObj of gains) {
      const ratio = gainObj.gain - 1;
      if (ratio > 0) {
        positiveGains.push(gainObj);
      } else {
        negativeGains.push(gainObj);
      }
      // const adjustedGain = ((gain.gain - 1) * ratio) + 1;
      total += ratio;
    }
    // let time1 = 0;
    // let time2 = 0;
    // let low = 0;
    // let lowTimes = 0;
    // for (const obj of positiveGains) {
    //     time1 += obj.time;
    //     if (obj.lowestLossPercent < 0) {
    //         lowTimes++;
    //         low += obj.lowestLossPercent;
    //     }
    // }
    // for (const obj of negativeGains) {
    //     time2 += obj.time;
    // }

    return total;
  }

  public static getUTCTime() {
    const date = new Date(Date.now());
    return date.getUTCHours() * CONSTANTS.MINS_IN_HOUR + date.getUTCMinutes();
  }

  public static getMinutesInDayEastCoast = (date: Date) => {
    const ecd = this.getEastCoastDate(date);
    return this.getMinutesInDay(ecd);
  };

  /* have performance issues with this function */
  public static getMinutesInDayEastCoastSlow = (date = new Date()) => {
    const eastCoastDate = new Date(
      date.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );
    return (
      eastCoastDate.getHours() * CONSTANTS.MINS_IN_HOUR +
      eastCoastDate.getMinutes()
    );
  };

  /* unsafe */
  public static getMinutesInDay(date: Date) {
    return date.getHours() * CONSTANTS.MINS_IN_HOUR + date.getMinutes();
  }

  public static getEastCoastDate(date = new Date()) {
    const parts = this.formatter.formatToParts(date);
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") p[part.type] = parseInt(part.value);
    }
    // Normalize hour: 24 → 0 (formatter's hour=24 is already on the correct day)
    const hour = p.hour % 24;
    return new Date(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  }

  public static inBounds(datetime: number) {
    const minutes = this.getMinutesInDay(
      this.getEastCoastDate(new Date(datetime)),
    );
    return minutes >= CONSTANTS.BEGIN_TIME && minutes < CONSTANTS.END_TIME;
  }

  public static periodisEligible(
    time: number,
    period: number,
    simulation = false,
  ) {
    const beginTime = simulation
      ? CONSTANTS.SIM_BEGIN_TIME
      : CONSTANTS.BEGIN_TIME;
    return period === PeriodType.DAY || (time - beginTime) % period === 0;
  }

  public static organizeGainsByGainTotal(gainz: IGainTotal[]) {
    for (let i = 1; i < gainz.length; i++) {
      const key = gainz[i].total;
      const obj = { ...gainz[i] };
      let j = i - 1;
      while (j >= 0 && gainz[j].total > key) {
        gainz[j + 1] = { ...gainz[j] };
        j = j - 1;
      }
      gainz[j + 1] = obj;
    }
    return gainz;
  }

  public static organizeGainsByAvgGainTotal(gainz: IGainTotal[]) {
    for (let i = 1; i < gainz.length; i++) {
      const key = gainz[i].total;
      const obj = { ...gainz[i] };
      let j = i - 1;
      while (j >= 0 && gainz[j].total > key) {
        gainz[j + 1] = { ...gainz[j] };
        j = j - 1;
      }
      gainz[j + 1] = obj;
    }
    return gainz;
  }

  public static getStringSurroundedByQuotes(string: string) {
    return "'" + string + "'";
  }

  public static getMySQLDateStringFromDatetime(datetime: number) {
    const date = this.getEastCoastDate(new Date(datetime));
    return (
      date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate()
    );
  }

  /* used for assigning data/properties from one obj to another */
  public static assignProperties(
    parentData: IFilterData,
    childData: IFilterData,
  ) {
    for (const key of Object.keys(childData)) {
      // need a better way to do this, but for now just want to make sure we don't accidentally overwrite timeSinceEntry or percentGain, which are calculated and assigned in a different way than the rest of the filter data, and if we overwrite them here, it will mess up calculations in the strategy run
      if (["timeSinceEntry", "percentGain"].includes(key)) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(parentData, key)) {
        for (const stock of Object.keys(childData[key])) {
          childData[key][stock] = parentData[key][stock];
        }
      }
    }
  }
}
