import { CONSTANTS, MemoryType, PeriodType } from "../shared/constants";
import {
  IMemory,
  IFilterData,
  IStockData,
  IAllMemory,
  IAllFilterData,
  IAllStockNames,
  IMemoryBackTest,
} from "../types/data-processing-types";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { initMemories } from "../shared/utilities/run-util";
import {
  VariableMatchers,
  VariableParsers,
  VariablePatterns,
  VariableBuilders,
} from "../shared/utilities/variable-patterns";
import * as VariableCalc from "../shared/utilities/variable-calculations";

export class MemoriesHelper {
  static initMemories(allVars: IAllFilterData, allNames: IAllStockNames) {
    const allMemories: IAllMemory = initMemories();
    const { PERIODS } = CONSTANTS;

    PERIODS.forEach((period) => {
      const vars = allVars[period];
      const names = allNames[period];
      if (vars) {
        const memoryReqs = this.calculateMemoryRequirements(vars, period);
        if (process.env.DEBUG) {
          console.log(`Memory requirements for period ${period}:`, memoryReqs);
        }

        if (names?.length) {
          allMemories[period] ||= {
            [MemoryType.PRICE]: {},
            [MemoryType.VOLUME]: {},
          };
          this.initializeMemories(allMemories[period], names, memoryReqs);
        }
      }
    });

    if (process.env.DEBUG) {
      console.log("All Memories:");
      Object.entries(allMemories).forEach(([period, memoryTypes]) => {
        console.log(`Period: ${period}`);
        Object.entries(memoryTypes).forEach(([memoryType, symbols]) => {
          console.log(`  MemoryType: ${memoryType}`);
          Object.entries(symbols).forEach(([symbol, mem]) => {
            console.log(`    Symbol: ${symbol}, Memory:`, mem);
          });
        });
      });
    }

    return allMemories;
  }

  static vwapCheck(vwap?: number): vwap is number {
    if (!vwap) {
      throw new Error("VWAP must be defined for MTSI calculations");
    }
    return true;
  }

  static adjustMemory(
    dataMap: Partial<Record<PeriodType, IStockData[]>> | IStockData[],
    timePeriods: PeriodType[],
    allMemories: IAllMemory,
    allVars?: IAllFilterData,
  ) {
    let data2dMap:
      | undefined
      | Partial<Record<PeriodType, Record<string, IStockData>>>;
    if (!Array.isArray(dataMap)) {
      data2dMap = {};
      for (const period of Object.keys(dataMap)) {
        const periodType = parseInt(period);
        if (StrategyUtil.isPeriodType(periodType)) {
          const dataArr = dataMap[periodType];
          if (dataArr) {
            data2dMap[periodType] = {};
            for (const item of dataArr) {
              data2dMap[periodType][item.symbol] = item;
            }
          }
        }
      }
    }
    timePeriods.sort().forEach((period) => {
      const memories = allMemories[period];
      const data = Array.isArray(dataMap) ? dataMap : dataMap[period] || [];

      const timeUnitLength = period * CONSTANTS.MILLIS_IN_MINUTE;
      const { PRICE } = MemoryType;
      data.forEach((item) => {
        const stock = item.symbol;
        for (const memoryType of Object.keys(memories)) {
          const mem = memories[memoryType]?.[stock];
          if (!mem) continue;
          const lastTime = mem.lastTime;
          const datetime = item.datetime;
          const memoryList = mem.list;
          // instead of calling date-util.tradingDaysSince, we default to 1, and just assume that
          // the day candles are valid, and there are no lapses.
          const unitsAgo =
            period >= PeriodType.DAY
              ? 1
              : Math.round((datetime - lastTime) / timeUnitLength);

          if (unitsAgo === 0) {
            throw new Error(
              `unitsAgo should not be 0 -- in memories-helper.ts adjustMemory, at ${new Date(datetime).toLocaleString()} with memoryType ${memoryType} and symbol ${stock} and period ${period}`,
            );
          }
          // shift left
          memoryList.copyWithin(0, unitsAgo);

          // fill the vacated slots with NaN
          memoryList.fill(
            NaN,
            memoryList.length - unitsAgo,
            memoryList.length - 1,
          );

          const lastIndex = mem.space - 1;
          switch (true) {
            case memoryType === PRICE:
              memoryList[lastIndex] = item.price;
              break;
            case memoryType === MemoryType.VOLUME:
              memoryList[lastIndex] = item.volume;
              break;
            case VariableMatchers.isMtsiVwap(memoryType) &&
              memoryType.includes("Numerator"):
              {
                if (allVars) {
                  const vwapPeriod =
                    VariableParsers.parseMtsiVwapPeriod(memoryType);
                  if (StrategyUtil.isPeriodType(vwapPeriod) && data2dMap) {
                    const crossPeriodItem = data2dMap[vwapPeriod]?.[stock];
                    /* crossPeriodItem?.price uses optionalChaining because sometimes there isn't a candle at 3:59;
                                            sometimes the candle is missing, or the market closed early that day.  the day candles date times are manually
                                            edited to be 3:59 pm everyday*/
                    const vwap = this.getVwap(
                      memoryType,
                      allVars,
                      stock,
                      crossPeriodItem?.price ?? 0,
                      crossPeriodItem?.volume ?? 0,
                    );
                    if (vwap) {
                      memoryList[lastIndex] =
                        VariableCalc.calculateMtsiNumerator(item.price, vwap);
                    }
                  }
                }
              }
              break;
            case VariableMatchers.isMtsiVwap(memoryType) &&
              memoryType.includes("Denominator"):
              {
                if (allVars) {
                  const vwapPeriod =
                    VariableParsers.parseMtsiVwapPeriod(memoryType);
                  if (StrategyUtil.isPeriodType(vwapPeriod) && data2dMap) {
                    const crossPeriodItem = data2dMap[vwapPeriod]?.[stock];
                    const vwap = this.getVwap(
                      memoryType,
                      allVars,
                      stock,
                      crossPeriodItem?.price ?? 0,
                      crossPeriodItem?.volume ?? 0,
                    );
                    if (vwap) {
                      memoryList[lastIndex] =
                        VariableCalc.calculateMtsiDenominator(item.price, vwap);
                    }
                  }
                }
              }
              break;
            case VariableMatchers.isMacd(memoryType):
              {
                const parsed = VariableParsers.parseMacd(memoryType);
                if (parsed) {
                  const { fast, slow } = parsed;
                  const fastEmaKey = VariableBuilders.priceEma(fast);
                  const slowEmaKey = VariableBuilders.priceEma(slow);
                  const fastEma =
                    memories[fastEmaKey]?.[stock]?.list[
                      memories[fastEmaKey]?.[stock]?.list.length - 1
                    ];
                  const slowEma =
                    memories[slowEmaKey]?.[stock]?.list[
                      memories[slowEmaKey]?.[stock]?.list.length - 1
                    ];
                  memoryList[lastIndex] = VariableCalc.calculateMacd(
                    fastEma,
                    slowEma,
                  );
                }
              }
              break;
            default:
              // Handle other memory types if needed
              break;
          }
          const periodLength = StrategyUtil.extractTimeAgo(memoryType);

          switch (true) {
            case VariablePatterns.mtsiVwapEma1.test(memoryType) &&
              memoryType.includes("Numerator"):
              {
                const vwapPeriod =
                  VariableParsers.parseMtsiVwapPeriod(memoryType);
                const numeratorList =
                  memories[`mtsiNumeratorVwap${vwapPeriod}`]?.[stock]?.list;
                if (numeratorList) {
                  if (memoryList.length === 0) {
                    const validArr = numeratorList.filter((item) =>
                      Boolean(item),
                    );
                    memoryList[lastIndex] =
                      validArr.reduce((acc, val) => acc + val, 0) /
                      validArr.length;
                  } else {
                    memoryList[lastIndex] = VariableCalc.calculateMtsiEma(
                      numeratorList[numeratorList.length - 1],
                      memoryList[lastIndex - 1],
                      periodLength,
                      numeratorList,
                    );
                  }
                }
              }

              break;
            case VariablePatterns.mtsiVwapEma1.test(memoryType) &&
              memoryType.includes("Denominator"):
              {
                const vwapPeriod =
                  VariableParsers.parseMtsiVwapPeriod(memoryType);
                const denominatorList =
                  memories[`mtsiDenominatorVwap${vwapPeriod}`]?.[stock]?.list;
                if (denominatorList) {
                  if (memoryList.length === 0) {
                    const validArr = denominatorList.filter((item) =>
                      Boolean(item),
                    );
                    memoryList[lastIndex] =
                      validArr.reduce((acc, val) => acc + val, 0) /
                      validArr.length;
                  } else {
                    memoryList[lastIndex] = VariableCalc.calculateMtsiEma(
                      denominatorList[denominatorList.length - 1],
                      memoryList[lastIndex - 1],
                      periodLength,
                      denominatorList,
                    );
                  }
                }
              }
              break;
            default:
              // Handle other memory types if needed
              break;
          }

          //console.log(`Memory for type "${memoryType}", stock "${stock}":`, mem);
          mem.lastTime = datetime;
        }
      });
      //this.doMemoryAdjustment(memories, period, data, vars);
    });
  }

  private static calculateMemoryRequirements(
    vars: IFilterData,
    period: PeriodType,
  ) {
    let priceMemory = 0,
      volumeMemory = 0;
    const memorySpaces: { [key: string]: number } = {};
    Object.entries(vars).forEach(([key, value]) => {
      if (value) {
        const timeAgo = StrategyUtil.extractTimeAgo(key);
        const timeAgoPlusOne = timeAgo + 1;
        switch (true) {
          case VariableMatchers.isPercentChange(key):
          case VariableMatchers.isRsi(key):
            priceMemory = Math.max(priceMemory, timeAgoPlusOne);
            break;
          case VariableMatchers.isPricePercentChangePercentile(key):
            {
              const parsed =
                VariableParsers.parsePricePercentChangePercentile(key);
              if (parsed) {
                const windowBars = this.getRollingWindowBars(
                  period,
                  parsed.sessions,
                );
                priceMemory = Math.max(
                  priceMemory,
                  parsed.period + windowBars + 1,
                );
              }
            }
            break;
          case VariableMatchers.isPriceEma(key):
          case VariableMatchers.isPriceSma(key):
          case VariableMatchers.isBollingerBands(key):
            priceMemory = Math.max(priceMemory, timeAgo);
            break;
          case VariableMatchers.isVolumePercentChange(key):
            volumeMemory = Math.max(volumeMemory, timeAgoPlusOne);
            memorySpaces["volume"] = volumeMemory;
            break;
          case VariableMatchers.isVolumeSma(key):
            volumeMemory = Math.max(volumeMemory, timeAgo);
            memorySpaces["volume"] = volumeMemory;
            break;
          case VariableMatchers.isRsiCrossover(key):
            {
              const parsed = VariableParsers.parseRsiCrossover(key);
              if (!parsed)
                throw new Error(`Invalid RSI crossover key format: ${key}`);
              const { period, before, after } = parsed;
              if (period < 2) {
                throw new Error(`Invalid RSI period: ${period}`);
              }
              const memory = after + before;
              priceMemory = Math.max(priceMemory, period + 1);
              const memoryName = `rsi${period}`;
              const prev = memorySpaces[memoryName];
              memorySpaces[memoryName] =
                prev !== undefined ? Math.max(prev, memory) : memory;
            }
            break;

          case VariableMatchers.isRsiDivergence(key):
            {
              const parsed = VariableParsers.parseRsiDivergence(key);
              if (!parsed)
                throw new Error(`Invalid RSI divergence key format: ${key}`);
              const { period, lookback } = parsed;
              if (period < 2) {
                throw new Error(`Invalid RSI period: ${period}`);
              }
              priceMemory = Math.max(priceMemory, period + 1);
              const memoryName = `rsi${period}`;
              const prev = memorySpaces[memoryName];
              memorySpaces[memoryName] =
                prev !== undefined ? Math.max(prev, lookback) : lookback;
            }
            break;
          case VariableMatchers.isMacdDivergence(key):
            {
              const parsed = VariableParsers.parseMacdDivergence(key);
              if (!parsed)
                throw new Error(`Invalid MACD divergence key format: ${key}`);
              const { fast: fastPeriod, slow: slowPeriod, lookback } = parsed;
              const memoryName = VariableBuilders.macd(fastPeriod, slowPeriod);
              priceMemory = Math.max(priceMemory, slowPeriod);

              const prev = memorySpaces[memoryName];
              memorySpaces[memoryName] =
                prev !== undefined ? Math.max(prev, lookback) : lookback;
            }

            break;
          case VariableMatchers.isMacdCrossover(key):
            {
              const match = key.match(VariablePatterns.macdCrossover);
              if (match) {
                const fast = parseInt(match[1]);
                const slow = parseInt(match[2]);
                const signal = parseInt(match[3]);
                const periodsBefore = parseInt(match[5]);
                const periodsAfter = parseInt(match[6]);
                priceMemory = Math.max(priceMemory, slow);

                const prev1 = memorySpaces[VariableBuilders.macd(fast, slow)];
                const memory = Math.max(
                  ...[periodsAfter + periodsBefore, prev1, signal].filter(
                    (item) => Number.isInteger(item),
                  ),
                );

                memorySpaces[VariableBuilders.macd(fast, slow)] = memory;
                const prev2 =
                  memorySpaces[VariableBuilders.macdSignal(fast, slow, signal)];
                memorySpaces[VariableBuilders.macdSignal(fast, slow, signal)] =
                  prev2 !== undefined
                    ? Math.max(prev2, periodsBefore + periodsAfter)
                    : periodsBefore + periodsAfter;
              }
            }
            break;
          case VariableMatchers.isMacd(key):
            {
              const parsed = VariableParsers.parseMacd(key);
              if (parsed) {
                const { fast, slow } = parsed;
                priceMemory = Math.max(priceMemory, fast, slow);
              }
            }
            break;
          case VariableMatchers.isMacdSignal(key):
            {
              const parsed = VariableParsers.parseMacdSignal(key);
              if (parsed) {
                const { fast, slow, signal: signalLine } = parsed;
                const prev = memorySpaces[VariableBuilders.macd(fast, slow)];
                priceMemory = Math.max(priceMemory, fast, slow);
                memorySpaces[VariableBuilders.macd(fast, slow)] =
                  prev !== undefined ? Math.max(prev, signalLine) : signalLine;
              }
            }
            break;
          case VariableMatchers.isMtsi(key):
            {
              const parsed = VariableParsers.parseMtsi(key);
              if (!parsed) throw new Error(`Invalid MTSI key format: ${key}`);
              const { m: M, n: N, vwapPeriod } = parsed;
              const currentMtsiNumeratorMemory =
                memorySpaces[VariableBuilders.mtsiVwap(vwapPeriod, true)];
              const currentMtsiDenominatorMemory =
                memorySpaces[VariableBuilders.mtsiVwap(vwapPeriod, false)];
              const currentMtsiNumeratorEmaMemory =
                memorySpaces[VariableBuilders.mtsiVwapEma(vwapPeriod, M, true)];
              const currentMtsiDenominatorEmaMemory =
                memorySpaces[
                  VariableBuilders.mtsiVwapEma(vwapPeriod, M, false)
                ];

              if (M > 1) {
                memorySpaces[VariableBuilders.mtsiVwap(vwapPeriod, true)] =
                  currentMtsiNumeratorMemory !== undefined
                    ? Math.max(currentMtsiNumeratorMemory, M)
                    : M;
                memorySpaces[VariableBuilders.mtsiVwap(vwapPeriod, false)] =
                  currentMtsiDenominatorMemory !== undefined
                    ? Math.max(currentMtsiDenominatorMemory, M)
                    : M;
              } else {
                throw new Error(
                  `First EMA period for mtsi must be greater than 1`,
                );
              }

              if (N > 1) {
                memorySpaces[
                  VariableBuilders.mtsiVwapEma(vwapPeriod, M, true)
                ] =
                  currentMtsiNumeratorEmaMemory !== undefined
                    ? Math.max(currentMtsiNumeratorEmaMemory, N)
                    : N;
                memorySpaces[
                  VariableBuilders.mtsiVwapEma(vwapPeriod, M, false)
                ] =
                  currentMtsiDenominatorEmaMemory !== undefined
                    ? Math.max(currentMtsiDenominatorEmaMemory, N)
                    : N;
              }
            }
            break;
          case key.startsWith("tsiM") &&
            key.includes("N") &&
            !key.includes("Vwap"):
            {
              const M = parseInt(key.substring(4, key.indexOf("N")));
              const N = parseInt(key.substring(key.indexOf("N") + 1));
              const prevNum = memorySpaces[VariableBuilders.tsiMemoryKey(true)];
              const prevNumEma =
                memorySpaces[VariableBuilders.tsiEmaMemoryKey(true, M)];
              const prevDen =
                memorySpaces[VariableBuilders.tsiMemoryKey(false)];
              const prevDenEma =
                memorySpaces[VariableBuilders.tsiEmaMemoryKey(false, M)];
              const firstEmaMemorySpace = M;
              const secondEmaMemorySpace = N;
              if (M > 1) {
                memorySpaces[VariableBuilders.tsiMemoryKey(true)] =
                  prevNum !== undefined
                    ? Math.max(prevNum, firstEmaMemorySpace)
                    : firstEmaMemorySpace;
                memorySpaces[VariableBuilders.tsiMemoryKey(false)] =
                  prevDen !== undefined
                    ? Math.max(prevDen, firstEmaMemorySpace)
                    : firstEmaMemorySpace;
              } else {
                throw new Error(
                  `First EMA period for tsi must be greater than 1`,
                );
              }
              if (N > 1) {
                memorySpaces[VariableBuilders.tsiEmaMemoryKey(false, M)] =
                  prevDenEma !== undefined
                    ? Math.max(prevDenEma, secondEmaMemorySpace)
                    : secondEmaMemorySpace;
                memorySpaces[VariableBuilders.tsiEmaMemoryKey(true, M)] =
                  prevNumEma !== undefined
                    ? Math.max(prevNumEma, secondEmaMemorySpace)
                    : secondEmaMemorySpace;
              }
            }
            break;
        }
      }
    });
    memorySpaces["price"] = priceMemory;
    // Log all entries in memorySpaces
    if (process.env.DEBUG) {
      console.log("Calculated memorySpaces:");
      Object.entries(memorySpaces).forEach(([memKey, memVal]) => {
        console.log(`  ${memKey}: ${memVal}`);
      });
    }
    return memorySpaces;
  }

  private static initializeMemories(
    memories: Record<string, IMemory | IMemoryBackTest>,
    names: string[],
    memoryReqs: Record<string, number>,
  ) {
    names.forEach((name) => {
      Object.keys(memoryReqs).forEach((key) => {
        if (!memories[key]) {
          memories[key] = {};
        }
        const memorySize = memoryReqs[key];
        if (memorySize > 0 && !memories[key][name]) {
          memories[key][name] = this.createMemorySpace(memorySize);
        }
      });
    });
  }

  private static createMemorySpace(size: number): {
    space: number;
    list: number[];
    lastTime: number;
  } {
    return { space: size, list: new Array(size).fill(NaN), lastTime: 0 };
  }

  private static trimConsecutiveUndefined(arr: number[]): number[] {
    return arr.filter((_, i) => arr[i] !== undefined);
  }

  /* in back-test-master-job, adjustMemories is called before processData.  so the vwap for the current moment
        in time is not yet stored.  thus, the vwap must be calculated.  vwapNumeratorCumulative and vwapDenominatorCumulative
        are calculated using the latest price and volume, and then divided to get the vwap */
  private static getVwap(
    memoryType: string,
    allVars: IAllFilterData,
    stock: string,
    price: number,
    volume: number,
  ) {
    /* handle when price and volume are undefined.  this happens if there is not a minute candle found at 3:59, for whatever reason.
        then, in adjustMemory(), crossPeriodItem?.price and crossPeriodItem?.volume are undefined when passed to getVwap */
    const vwapPeriod = VariableParsers.parseMtsiVwapPeriod(memoryType);
    const vwapPeriodType =
      CONSTANTS.PERIODS[CONSTANTS.PERIODS.indexOf(vwapPeriod)];
    const vwapNumeratorCumulative =
      (allVars?.[vwapPeriodType]?.["vwapNumeratorCumulative"]?.[stock] ?? 0) +
      price * volume;
    const vwapDenominatorCumulative =
      (allVars?.[vwapPeriodType]?.["vwapDenominatorCumulative"]?.[stock] ?? 0) +
      volume;
    const vwap = vwapNumeratorCumulative / vwapDenominatorCumulative;
    return vwap;
  }

  private static rollAndAppend(arr: number[], shift: number, newValue: number) {
    arr.copyWithin(0, shift);
    arr.fill(NaN, arr.length - shift, arr.length - 1); // end is exclusive
    arr[arr.length - 1] = newValue;
    return arr;
  }

  private static getRollingWindowBars(
    period: PeriodType,
    sessions: number,
  ): number {
    const safeSessions = Math.max(1, Math.floor(sessions));
    if (period >= PeriodType.DAY) {
      return safeSessions;
    }

    const sessionMinutes = CONSTANTS.END_TIME - CONSTANTS.BEGIN_TIME;
    const barsPerSession = Math.max(1, Math.ceil(sessionMinutes / period));
    const bars = safeSessions * barsPerSession;
    return Math.min(5000, Math.max(300, bars));
  }
}
