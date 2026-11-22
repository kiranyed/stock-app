import { CONSTANTS, PeriodType } from "../../shared/constants";
import { SchwabAPI } from "../../shared/services/trading-api";
import { ICandle, ICandleData } from "../../types/back-test-types";
import {
  CandleSource,
  IDailyAdjustContext,
  IFetchedCandles,
  requestFrequency,
  throwUnexpectedDailyTime,
} from "./candle-source";

const BATCH_SIZE = 250;
const BATCH_DELAY_MS = 10000;

// Schwab stamps daily candles at midnight Central time.
export class SchwabCandleSource implements CandleSource {
  async fetch(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]> {
    const periodType = period === PeriodType.DAY ? "month" : "day";
    const frequencyType = periodType === "day" ? "minute" : "daily";
    const frequency = requestFrequency(period);
    const results: ICandleData[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols
        .slice(i, i + BATCH_SIZE)
        .map((symbol) =>
          SchwabAPI.getHistoryWithBounds(
            symbol,
            periodType,
            frequencyType,
            frequency,
            startTime,
            endTime ? endTime : Date.now(),
          ),
        );
      results.push(...(await Promise.all(batch)));

      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    return results;
  }

  adjustDailyCandleTime(
    candle: ICandle,
    mins: number,
    context: IDailyAdjustContext,
  ): number {
    switch (mins) {
      case 0:
        if (context.isUTC) {
          context.easternOffsetMin -= 60;
          console.log("DST ended, adjusting offset to", context.easternOffsetMin);
          return (
            candle.datetime +
            (15 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
          );
        }
        return (
          candle.datetime +
          (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
        );
      case 60:
        return (
          candle.datetime +
          (15 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
        );
      case 120:
        if (context.isUTC) {
          context.easternOffsetMin += 60;
          console.log("DST started, adjusting offset to", context.easternOffsetMin);
          return (
            candle.datetime +
            (15 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
          );
        }
        return candle.datetime;
      default:
        return throwUnexpectedDailyTime(mins, candle);
    }
  }
}
