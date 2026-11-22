import { CONSTANTS, MemoryType, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import {
  IAllHistograms,
  IFilterData,
  IStockData,
  IAllFilterData,
  IAllStockNames,
  IAllMemory,
  IStockScreenerJob,
} from "../types/data-processing-types";
import { StrategyUtil } from "../shared/utilities/strategy-util";
import { VariableUtil } from "../shared/utilities/variable-util";
import {
  VariableBuilders,
  VariableMatchers,
  VariableParsers,
  VariablePatterns,
  VariableTokens,
} from "../shared/utilities/variable-patterns";
import * as VariableCalc from "../shared/utilities/variable-calculations";

export class FilterVarsHelper {
  initVars(
    globalVars: IAllFilterData,
    jobs: IStockScreenerJob[],
    symbolsMatrix: IAllStockNames,
  ) {
    jobs.forEach((job) => {
      const period = job.getPeriod();
      const vars = (globalVars[period] ||= {});
      const symbols = symbolsMatrix[period];
      this.initializeStrategyVars(vars, job, symbols, period);

      const additionalPeriods = job.getAdditionalPeriods();
      const crossPeriodVars = job.getCrossPeriodVars();

      additionalPeriods.forEach((additionalPeriod) => {
        globalVars[additionalPeriod] ||= {};
        const vars = crossPeriodVars[additionalPeriod];
        if (vars) {
          for (const v of Object.keys(vars)) {
            this.initializeFilter(
              globalVars[additionalPeriod],
              vars,
              v,
              additionalPeriod,
              symbols,
            );
          }
        }
      });
    });
    return globalVars;
  }

  private initializeStrategyVars(
    vars: IFilterData,
    job: IStockScreenerJob,
    symbols: string[],
    period: PeriodType,
  ) {
    const jobVars = job.getVars();

    const variables = job.getAllVariables();
    if (process.env.DEBUG) {
      console.log("strategy name: " + job.getName());
      console.log("Variables:\n" + variables.join("\n"));
    }
    variables.forEach((filterName) => {
      this.initializeFilter(vars, jobVars, filterName, period, symbols);
    });
  }

  private initializeFilter(
    vars: IFilterData,
    screenerVars: IFilterData,
    filterName: string,
    period: PeriodType,
    symbols: string[],
  ) {
    this.validatePercentileWindowLimit(filterName, period);
    vars[filterName] ||= {};
    screenerVars[filterName] ||= {};
    symbols.forEach((symbol) => {
      vars[filterName][symbol] ||= NaN;
      screenerVars[filterName][symbol] ||= NaN;
    });
  }

  private validatePercentileWindowLimit(
    filterName: string,
    period: PeriodType,
  ): void {
    if (!VariableMatchers.isPricePercentChangePercentile(filterName)) {
      return;
    }
    const parsed = VariableParsers.parsePricePercentChangePercentile(filterName);
    if (!parsed) {
      return;
    }

    const maxSessions = CONSTANTS.MAX_PERCENTILE_SESSIONS[period];
    if (maxSessions !== undefined && parsed.sessions > maxSessions) {
      throw new Error(
        `Invalid percentile window for period ${period}: sessions ${parsed.sessions} exceeds max ${maxSessions}`,
      );
    }
  }

  transferVars(
    jobs: IStockScreenerJob[],
    timePeriods: PeriodType[],
    allVars: IAllFilterData,
    allMemories: IAllMemory,
    data: IStockData[] | Partial<Record<PeriodType, IStockData[]>>,
    datetime: number,
    allHistograms?: IAllHistograms,
  ) {
    const dateObj = new Date(datetime);
    const minsInDay =
      StockTradeUtil.getMinutesInDayEastCoast(dateObj) - CONSTANTS.BEGIN_TIME;
    const prices: { [key: string]: number } = {};

    const PRICE = MemoryType.PRICE;
    timePeriods = timePeriods.sort();
    for (const period of timePeriods) {
      const vars = allVars[period];
      const memories = allMemories[period];
      const dataArr = Array.isArray(data) ? data : data[period];
      if (dataArr) {
        for (const item of dataArr) {
          const price = item.price;
          const symbol = item.symbol;
          const volume = item.volume;
          let oldVwapDenominatorVal = 0;
          prices[symbol] = price;
          Object.keys(vars).forEach((key) => {
            let variableValue = NaN;
            let shouldAssign = false;
            const priceListLength = memories[PRICE][symbol]?.list.length || 0;
            const timeAgo = StrategyUtil.extractTimeAgo(key);

            if (key === MemoryType.PRICE) {
              variableValue = price;
              shouldAssign = true;
            } else if (key === VariableBuilders.timeKey()) {
              variableValue = minsInDay;
              shouldAssign = true;
            } else if (key === MemoryType.VOLUME) {
              if (StrategyUtil.isStockDataBackTest(item) || period >= PeriodType.DAY) {
                variableValue = volume;
              } else {
                // if live, than the item.volume value actually the cumulative volume
                variableValue = vars[key][symbol]
                  ? volume - vars[key][symbol]
                  : volume;
              }
              shouldAssign = true;
            }

            if (VariableMatchers.isPercentChange(key)) {
              shouldAssign = true;
              if (priceListLength >= timeAgo) {
                const previousPrice =
                  memories[PRICE][symbol].list[priceListLength - (timeAgo + 1)];
                variableValue = VariableCalc.calculatePercentChange(
                  price,
                  previousPrice,
                );
              }
            } else if (VariableMatchers.isVolumeSma(key)) {
              shouldAssign = true;
              const periodLength = VariableParsers.extractPeriod(key);
              if (periodLength === 1) {
                variableValue = volume;
              } else if (
                memories[MemoryType.VOLUME]?.[symbol]?.list?.length >=
                periodLength
              ) {
                variableValue = VariableCalc.calculateSma(
                  memories[MemoryType.VOLUME][symbol].list,
                  periodLength,
                );
              }
            } else if (VariableMatchers.isPriceSma(key)) {
              shouldAssign = true;
              const periodLength = VariableParsers.extractPeriod(key);
              if (periodLength === 1) {
                variableValue = price;
              } else if (
                memories[PRICE]?.[symbol]?.list?.length >= periodLength
              ) {
                variableValue = VariableCalc.calculateSma(
                  memories[PRICE][symbol].list,
                  periodLength,
                );
              }
            } else if (VariableMatchers.isPriceEma(key)) {
              shouldAssign = true;
              const periodLength = VariableParsers.extractPeriod(key);
              if (periodLength === 1) {
                variableValue = price;
              } else if (vars[key][symbol]) {
                variableValue = VariableCalc.calculateEma(
                  price,
                  vars[key][symbol],
                  periodLength,
                );
              } else if (
                memories[PRICE]?.[symbol]?.list?.length >= periodLength
              ) {
                variableValue = VariableCalc.calculateSma(
                  memories[PRICE][symbol].list,
                  periodLength,
                );
              }
            } else if (VariableMatchers.isRsi(key)) {
              shouldAssign = true;
              const periodLength = VariableParsers.extractPeriod(key);
              if (priceListLength >= periodLength) {
                const arr = memories[PRICE][symbol].list.slice(
                  -periodLength - 1,
                );
                variableValue = VariableCalc.calculateRsi(arr, periodLength);
              }
            } else if (VariableMatchers.isBollingerBandsLower(key)) {
              shouldAssign = true;
              const match = key.match(VariablePatterns.bollingerBands);
              const periodLength = match ? parseInt(match[1]) : 0;
              const fullArr = memories[PRICE][symbol].list.slice(-periodLength);
              if (priceListLength >= periodLength) {
                const middleBand =
                  fullArr.reduce((a, b) => a + b, 0) / periodLength;
                const stdDev = Math.sqrt(
                  fullArr
                    .slice(-periodLength)
                    .reduce(
                      (sum, value) => sum + Math.pow(value - middleBand, 2),
                      0,
                    ) / periodLength,
                );
                vars[key][symbol] = middleBand - 2 * stdDev;
              }
            } else if (VariableMatchers.isBollingerBandsUpper(key)) {
              const match = key.match(VariablePatterns.bollingerBands);
              const periodLength = match ? parseInt(match[1]) : 0;
              if (priceListLength >= periodLength) {
                const fullArr =
                  memories[PRICE][symbol].list.slice(-periodLength);
                const middleBand =
                  fullArr.reduce((a, b) => a + b, 0) / periodLength;
                const stdDev = Math.sqrt(
                  fullArr
                    .slice(-periodLength)
                    .reduce(
                      (sum, value) => sum + Math.pow(value - middleBand, 2),
                      0,
                    ) / periodLength,
                );
                vars[key][symbol] = middleBand + 2 * stdDev;
              }
            } else if (VariableMatchers.isVwapNumeratorCumulative(key)) {
              shouldAssign = true;
              const vwapNumeratorKey =
                VariableBuilders.vwapNumeratorCumulative();
              const prevVal = vars[vwapNumeratorKey][symbol];
              if (StrategyUtil.isStockDataBackTest(item)) {
                if (!(item.high && item.close && item.low)) {
                  throw new Error(
                    `candle for ${symbol} at ${datetime}  (${new Date(datetime).toLocaleString()}) is incomplete, missing at least one of high, low and close`,
                  );
                }
                variableValue = prevVal
                  ? prevVal +
                    ((item.high + item.close + item.low) / 3) * item.volume
                  : ((item.high + item.close + item.low) / 3) * item.volume;
              } else {
                const vwapDeominatorKey =
                  VariableBuilders.vwapDenominatorCumulative();
                const previousVolume =
                  oldVwapDenominatorVal ?? vars[vwapDeominatorKey][symbol];
                variableValue = prevVal
                  ? prevVal + item.price * (item.volume - previousVolume)
                  : item.price * item.volume;
              }
            } else if (VariableMatchers.isVwapDenominatorCumulative(key)) {
              shouldAssign = true;
              const vwapDenominatorKey =
                VariableBuilders.vwapDenominatorCumulative();
              if (StrategyUtil.isStockDataBackTest(item)) {
                variableValue = vars[vwapDenominatorKey][symbol]
                  ? vars[vwapDenominatorKey][symbol] + item.volume
                  : item.volume;
              } else {
                oldVwapDenominatorVal = vars[vwapDenominatorKey][symbol];
                variableValue = item.volume;
              }
            } else if (VariableMatchers.isVwap(key)) {
              shouldAssign = true;
              const match = key.match(VariablePatterns.vwap);
              const vwapPeriod = match ? parseInt(match[1]) : 0;
              const period = CONSTANTS.PERIODS.find((p) => p === vwapPeriod);
              const vwapNumeratorKey =
                VariableBuilders.vwapNumeratorCumulative();
              const vwapDenominatorKey =
                VariableBuilders.vwapDenominatorCumulative();
              if (
                period &&
                allVars[period] &&
                allVars[period][vwapNumeratorKey]
              ) {
                variableValue =
                  allVars[period][vwapNumeratorKey][symbol] /
                  allVars[period][vwapDenominatorKey][symbol];
              }
            }

            if (shouldAssign) {
              vars[key][symbol] = variableValue;
            }
          });
          Object.keys(vars).forEach((key) => {
            let variableValue = NaN;
            let shouldAssign = false;

            const mtsiVwapMatch = key.match(VariablePatterns.mtsiVwap);
            // unit test this.  makesure Ema1 and Ema2 variables are still NaN in the first ierations
            // const mtsiVwapEma1Match = key.match(VariablePatterns.mtsiVwapEma1);
            // const mtsiVwapEma2Match = key.match(VariablePatterns.mtsiVwapEma2);
            // const mtsiMatch = mtsiVwapMatch ?? mtsiVwapEma1Match ?? mtsiVwapEma2Match;
            if (mtsiVwapMatch) {
              shouldAssign = true;
              const vwapPeriod = parseInt(mtsiVwapMatch[2]);
              const isNumerator = mtsiVwapMatch[1] === VariableTokens.numerator;
              const vwapKey = VariableBuilders.vwap(vwapPeriod);
              if (vars[vwapKey]) {
                const vwap = vars[vwapKey][symbol];
                variableValue = isNumerator
                  ? VariableCalc.calculateMtsiNumerator(price, vwap)
                  : VariableCalc.calculateMtsiDenominator(price, vwap);
              }
            } else if (VariableMatchers.isPricePercentChangePercentile(key)) {
              shouldAssign = true;
              const parsed =
                VariableParsers.parsePricePercentChangePercentile(key);
              if (parsed) {
                const { period: percentChangePeriod, sessions } = parsed;
                const percentChangeKey =
                  VariableBuilders.percentChange(percentChangePeriod);
                const currentChange = vars[percentChangeKey]?.[symbol];

                if (Number.isFinite(currentChange)) {
                  const histogram = allHistograms?.[period]?.[key]?.[symbol];
                  if (histogram && histogram.totalCount > 0) {
                    // fast path: O(bins) histogram lookup
                    variableValue =
                      VariableCalc.estimatePercentileFromHistogram(
                        currentChange,
                        histogram,
                      );
                  } else {
                    // fallback: raw scan (first-day warmup or histogram not built yet)
                    const priceHistory =
                      memories[PRICE]?.[symbol]?.list ?? [];
                    const rollingBars = this.getRollingWindowBars(
                      period,
                      sessions,
                    );
                    const minRequired = percentChangePeriod + 1;

                    if (priceHistory.length >= minRequired) {
                      const start = Math.max(
                        percentChangePeriod,
                        priceHistory.length -
                          (rollingBars + percentChangePeriod),
                      );
                      const historicalChanges: number[] = [];

                      for (
                        let idx = start;
                        idx < priceHistory.length;
                        idx++
                      ) {
                        const currentPrice = priceHistory[idx];
                        const previousPrice =
                          priceHistory[idx - percentChangePeriod];
                        if (
                          Number.isFinite(currentPrice) &&
                          Number.isFinite(previousPrice) &&
                          previousPrice !== 0
                        ) {
                          historicalChanges.push(
                            VariableCalc.calculatePercentChange(
                              currentPrice,
                              previousPrice,
                            ),
                          );
                        }
                      }

                      variableValue = VariableCalc.calculatePercentileRank(
                        currentChange,
                        historicalChanges,
                      );
                    }
                  }
                }
              }
            } else if (VariableMatchers.isRsiDivergence(key)) {
              shouldAssign = true;
              const parsed = VariableParsers.parseRsiDivergence(key);
              if (parsed) {
                const { period, before, after, bullish } = parsed;
                const rsiKey = VariableBuilders.rsi(period);
                if (vars[rsiKey][symbol]) {
                  const arr = memories[rsiKey][symbol]?.list || [];
                  const lookbackRsis = arr.slice(-(before + after));
                  const priceArr = memories[PRICE][symbol].list.slice(
                    -(before + after),
                  );
                  const divergenceFunc = bullish
                    ? VariableUtil.hasBullishDivergence
                    : VariableUtil.hasBearishDivergence;
                  variableValue = Number(
                    divergenceFunc(priceArr, lookbackRsis),
                  );
                }
              }
            }

            if (shouldAssign) {
              vars[key][symbol] = variableValue;
            }
          });
          Object.keys(vars).forEach((key) => {
            let variableValue = NaN;
            let shouldAssign = false;

            if (VariableMatchers.isMacd(key)) {
              shouldAssign = true;
              const parsed = VariableParsers.parseMacd(key);
              if (parsed) {
                const { fast, slow } = parsed;
                const fastEmaKey = VariableBuilders.priceEma(fast);
                const slowEmaKey = VariableBuilders.priceEma(slow);
                if (vars[fastEmaKey][symbol] && vars[slowEmaKey][symbol]) {
                  variableValue = VariableCalc.calculateMacd(
                    vars[fastEmaKey][symbol],
                    vars[slowEmaKey][symbol],
                  );
                }
              }
            } else if (VariablePatterns.mtsiVwapEma1.test(key)) {
              shouldAssign = true;
              const match = key.match(VariablePatterns.mtsiVwapEma1);
              const isNumerator = match
                ? match[1] === VariableTokens.numerator
                : false;
              const vwapPeriod = match ? parseInt(match[2]) : 0;
              const periodLength = match ? parseInt(match[3]) : 0;
              const dynamicKeyName = VariableBuilders.mtsiVwap(
                vwapPeriod,
                isNumerator,
              );
              if (periodLength === 1) {
                variableValue = vars[dynamicKeyName][symbol];
              } else if (vars[key][symbol] && vars[dynamicKeyName][symbol]) {
                variableValue = VariableCalc.calculateMtsiEma(
                  vars[dynamicKeyName][symbol],
                  vars[key][symbol],
                  periodLength,
                );
              } else if (
                memories[dynamicKeyName]?.[symbol]?.list?.length >= periodLength
              ) {
                variableValue = VariableCalc.calculateSma(
                  memories[dynamicKeyName][symbol].list,
                  periodLength,
                );
              }
            } else if (VariableMatchers.isRsiCrossover(key)) {
              shouldAssign = true;
              const parsed = VariableParsers.parseRsiCrossover(key);
              if (parsed) {
                const { period, level, before, after, bullish } = parsed;
                const rsiKey = VariableBuilders.rsi(period);
                if (vars[rsiKey][symbol]) {
                  const arr = memories[rsiKey][symbol]?.list || [];
                  const lookbackRsis = arr.slice(-(before + after));
                  const crossoverFunc = bullish
                    ? VariableUtil.hasBullishRsiCrossover
                    : VariableUtil.hasBearishRsiCrossover;
                  variableValue = Number(
                    crossoverFunc(lookbackRsis, level, before, after),
                  );
                }
              }
            }

            if (shouldAssign) {
              vars[key][symbol] = variableValue;
            }
          });
          Object.keys(vars).forEach((key) => {
            let variableValue = NaN;
            let shouldAssign = false;

            if (VariableMatchers.isMacdSignal(key)) {
              shouldAssign = true;
              const parsed = VariableParsers.parseMacdSignal(key);
              if (parsed) {
                const { fast, slow, signal: periodLength } = parsed;
                const macdKey = VariableBuilders.macd(fast, slow);
                if (vars[macdKey][symbol] && vars[key][symbol]) {
                  variableValue = VariableCalc.calculateEma(
                    vars[macdKey][symbol],
                    vars[key][symbol],
                    periodLength,
                  );
                } else if (
                  memories[macdKey]?.[symbol]?.list?.length >= periodLength
                ) {
                  variableValue = VariableCalc.calculateSma(
                    memories[macdKey][symbol].list,
                    periodLength,
                  );
                }
              }
            } else if (VariableMatchers.isMacdDivergence(key)) {
              shouldAssign = true;
              const parsed = VariableParsers.parseMacdDivergence(key);
              if (parsed) {
                const { fast, slow, lookback, bullish } = parsed;
                const macdKey = VariableBuilders.macd(fast, slow);
                const macdValues =
                  memories[macdKey][symbol].list.slice(-lookback);
                const prices = memories[PRICE][symbol].list.slice(-lookback);
                if (vars[macdKey][symbol]) {
                  const divergenceFunc = bullish
                    ? VariableUtil.hasBullishDivergence
                    : VariableUtil.hasBearishDivergence;
                  variableValue = Number(divergenceFunc(prices, macdValues));
                }
              }
            } else if (VariablePatterns.mtsiVwapEma2.test(key)) {
              shouldAssign = true;
              const match = key.match(VariablePatterns.mtsiVwapEma2);
              const isNumerator = match
                ? match[1] === VariableTokens.numerator
                : false;
              const vwapPeriod = match ? parseInt(match[2]) : 0;
              const mPeriod = match ? parseInt(match[3]) : 0;
              const nPeriod = match ? parseInt(match[4]) : 0;
              const dynamicKeyName = VariableBuilders.mtsiVwapEma(
                vwapPeriod,
                mPeriod,
                isNumerator,
              );
              if (nPeriod === 1) {
                variableValue = vars[dynamicKeyName][symbol];
              } else if (vars[key][symbol] && vars[dynamicKeyName]?.[symbol]) {
                variableValue = VariableCalc.calculateMtsiEma(
                  vars[dynamicKeyName][symbol],
                  vars[key][symbol],
                  nPeriod,
                );
              } else if (
                memories[dynamicKeyName]?.[symbol]?.list?.length >= nPeriod
              ) {
                variableValue = VariableCalc.calculateSma(
                  memories[dynamicKeyName][symbol].list,
                  nPeriod,
                );
              }
            }

            if (shouldAssign) {
              vars[key][symbol] = variableValue;
            }
          });
          Object.keys(vars).forEach((key) => {
            let variableValue = vars[key][symbol];
            let shouldAssign = false;

            if (VariableMatchers.isMtsi(key)) {
              shouldAssign = true;
              variableValue = NaN;
              const parsed = VariableParsers.parseMtsi(key);
              if (parsed) {
                const { m: mPeriod, n: nPeriod, vwapPeriod } = parsed;
                const numeratorKey = VariableBuilders.mtsiVwapEma2(
                  vwapPeriod,
                  mPeriod,
                  nPeriod,
                  true,
                );
                const denominatorKey = VariableBuilders.mtsiVwapEma2(
                  vwapPeriod,
                  mPeriod,
                  nPeriod,
                  false,
                );
                const numeratorVariable = vars[numeratorKey];
                const denominatorVariable = vars[denominatorKey];
                if (numeratorVariable[symbol] && denominatorVariable[symbol]) {
                  const mtsiValue = VariableCalc.calculateMtsi(
                    numeratorVariable[symbol],
                    denominatorVariable[symbol],
                  );
                  // when mtsi is 100 or -100, this is the first (or one of the first values), so it is not accurate
                  variableValue =
                    mtsiValue === 100 || mtsiValue === -100 ? NaN : mtsiValue;
                }
              }
            } else if (VariableMatchers.isMacdCrossover(key)) {
              shouldAssign = true;
              variableValue = NaN;
              const match = key.match(VariablePatterns.macdCrossover);
              if (match) {
                const fastPeriod = parseInt(match[1]);
                const slowPeriod = parseInt(match[2]);
                const signalPeriod = parseInt(match[3]);
                const direction = match[4];
                const periodsBefore = parseInt(match[5]);
                const periodsAfter = parseInt(match[6]);
                const macdKey = VariableBuilders.macd(fastPeriod, slowPeriod);
                const signalKey = VariableBuilders.macdSignal(
                  fastPeriod,
                  slowPeriod,
                  signalPeriod,
                );
                const macdValues = memories[macdKey][symbol].list.slice(
                  -(periodsAfter + periodsBefore),
                );
                const signalValues = memories[signalKey][symbol].list.slice(
                  -(periodsAfter + periodsBefore),
                );
                if (
                  macdValues.length === periodsAfter + periodsBefore &&
                  signalValues.length === periodsAfter + periodsBefore
                ) {
                  const crossoverFunc =
                    direction === VariableTokens.bullish
                      ? VariableUtil.hasBullishMacdCrossover
                      : VariableUtil.hasBearishMacdCrossover;
                  variableValue = Number(
                    crossoverFunc(
                      macdValues,
                      signalValues,
                      periodsAfter,
                      periodsBefore,
                    ),
                  );
                }
              }
            }

            if (shouldAssign) {
              vars[key][symbol] = variableValue;
            }
          });
        }
      }
    }

    for (const period of timePeriods) {
      if (period < PeriodType.DAY) {
        continue;
      }
      const vars = allVars[period];
      //const memories = allMemories[period];
      const dataArr = Array.isArray(data) ? data : data[period];
      if (dataArr) {
        for (const item of dataArr) {
          const price = item.price;
          const symbol = item.symbol;
          prices[symbol] = price;
          // ...existing variable calculations...

          // After all calculations for this symbol, print all variables and their values
          if (process.env.DEBUG) {
            console.log(`Variables for symbol: ${symbol} (period: ${period})`);
            Object.entries(vars).forEach(([key, valueObj]) => {
              const value = valueObj[symbol];
              console.log(`  ${key}: ${value}`);
            });
          }
        }
      }
    }

    for (const job of jobs) {
      const period = job.getPeriod();
      const vars = allVars[period];
      const strategyVars = job.getVars();
      StockTradeUtil.assignProperties(vars, strategyVars);
    }
  }

  private getRollingWindowBars(period: PeriodType, sessions: number): number {
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
