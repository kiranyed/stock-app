import StrategyMapper from "../../mappers/strategy-mapper";
import { IScreener, IStrategy } from "../../types/strategy-types";
import { DatabaseAPI } from "../services/db-api";
import StrategyRepository from "../services/repos/strategy-repository";

type IScreenerMap = { [key: string]: IScreener[] };

export class MassCreateStrategies {
  static getNumOfVars(screeners: IScreener[]) {
    let num = 0;
    for (const screener of screeners) {
      const buySellFilters = screener.buySellFilters;
      for (const filter of buySellFilters!.enter.filters) {
        const filt = filter;
        if (filt.timeAgo) {
          num++;
        }
        num++;
      }
      for (const filter of buySellFilters!.exit.filters) {
        const filt = filter;
        if (filt.timeAgo) {
          num++;
        }
        num++;
      }
    }
    return num;
  }

  static checkIfArrsValid(
    sampleStrat: string,
    objs: IScreenerMap,
    vals: number[][],
  ) {
    const numVars = this.getNumOfVars(objs[sampleStrat]);
    const inValidArrs = [];
    for (const arr of vals) {
      if (arr.length !== numVars) {
        inValidArrs.push(arr);
      }
    }
    console.log("invalid arrs for " + sampleStrat + ": ");
    for (const arr of inValidArrs) {
      console.log(arr);
    }
  }

  /* mass create random strategies.  set the parameters for the mass creation
     use random number generator and specify how many strategies you want, instead of manually creating each strategy */
  static async setParams() {
    await DatabaseAPI.createConnection();
    const sampleNameArray = [
      "sample1",
      "sample2",
      "sample3",
      "sample4",
      "sample5",
      "sample8",
    ];
    const samplesRaw = await StrategyRepository.getByName(sampleNameArray, 1);
    const samples = samplesRaw.map((sample) =>
      StrategyMapper.convertEntityToStrategy(sample),
    );
    const sampleObjects: IScreener[][] = [];
    const objs: IScreenerMap = {};
    for (const sample of samples) {
      const samp = sample;
      objs[samp.name] = samp.screeners;
      // sampleObjects.push(JSON.parse((sample as any).object));
    }
    for (const nam of sampleNameArray) {
      sampleObjects.push(objs[nam]);
    }

    for (const obj of sampleObjects) {
      console.log(this.getNumOfVars(obj));
    }
    const vals = new Array<number[]>();

    // this.checkIfArrsValid('sample4', objs, vals);

    // await this.createStrategies(sampleObjects[3], vals, 'sample4');
    // vals = [];

    vals.push([10, -0.8, 2, -0.08, 1, 0, 0.19]); // 22
    vals.push([15, -0.8, 2, -0.08, 1, 0, 0.19]); // 23
    vals.push([15, -0.8, 2, -0.08, 1, 0, 0.1]); // 24
    vals.push([20, -1, 7, -0.08, 7, 0, 0.19]); // 25
    vals.push([20, -1, 5, -0.2, 3, 0.04, 0.11]); // 26
    vals.push([45, -1, 10, -0.08, 7, 0, 0.23]); // 27
    vals.push([45, -1.5, 10, -0.2, 10, -0.06, 0.25]); // 28
    vals.push([45, -1.5, 10, -0.2, 10, -0.06, 0.25]); // 29
    vals.push([120, -2, 20, -0.15, 10, 0.05, 0.3]); // 30
    vals.push([120, -2, 30, -0.35, 5, 0.15, 0.3]); // 31
    vals.push([120, -2, 30, -0.35, 5, 0.15, 0.5]); // 32
    vals.push([60, -2, 15, -0.35, 5, 0.15, 0.5]); // 33
    vals.push([60, -2, 15, -0.35, 5, 0.15, 0.28]); // 34

    await this.createStrategies(sampleObjects[4], vals, "sample5MegaCap");
  }

  // given the paramameters, create each strategy and store it in the database

  static async createStrategies(
    screenersObj: IScreener[],
    vals: number[][],
    sampleName: string,
  ) {
    const screenerArr = new Array<IScreener[]>();
    const stratDBObjects = [];
    for (const valArr of vals) {
      const params = valArr.map((val) => val.toString());
      let valIndex = 0;
      const screeners = JSON.parse(JSON.stringify(screenersObj));
      const screener = screeners[0];
      const buySellFilters = screener.buySellFilters;
      const shortCoverFilters = screener.shortCoverFilters;
      if (buySellFilters) {
        const enter = buySellFilters.enter;
        for (const filter of enter.filters) {
          const filterCasted = filter;
          if (filterCasted.timeAgo) {
            filterCasted.timeAgo = params[valIndex++];
          }
          filterCasted.compareVal = params[valIndex++];
        }
        const exit = buySellFilters.exit;
        for (const filter of exit.filters) {
          const filterCasted = filter;
          if (filterCasted.timeAgo) {
            filterCasted.timeAgo = params[valIndex++];
          }
          filterCasted.compareVal = params[valIndex++];
        }
      }
      if (shortCoverFilters) {
        const enter = shortCoverFilters.enter;
        for (const filter of enter.filters) {
          const filterCasted = filter;
          if (filterCasted.timeAgo) {
            filterCasted.timeAgo = params[valIndex++];
          }
          filterCasted.compareVal = params[valIndex++];
        }
        const exit = shortCoverFilters.exit;
        for (const filter of exit.filters) {
          const filterCasted = filter;
          if (filterCasted.timeAgo) {
            filterCasted.timeAgo = params[valIndex++];
          }
          filterCasted.compareVal = params[valIndex++];
        }
      }
      screenerArr.push(screeners);
    }

    const rows = await DatabaseAPI.runQuery<IStrategy>(
      "select name from strategy where name like '%" + sampleName + "Version%'",
    );
    let maxNum = 0;
    for (const row of rows) {
      const startIdx = row.name.indexOf("Version") + "Version".length;
      const num = parseInt(row.name.substring(startIdx), 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }

    for (let i = 0; i < screenerArr.length; i++) {
      stratDBObjects.push({
        period: 60,
        name: sampleName + "Version" + (maxNum + i + 1),
        screeners: screenerArr[i],
        description: "",
      });
    }
    await StrategyRepository.createStrategy(stratDBObjects, -1);
    return screenerArr;
  }
}
