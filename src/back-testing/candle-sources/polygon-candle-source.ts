import { CONSTANTS, PeriodType } from "../../shared/constants";
import { SchwabAPI } from "../../shared/services/trading-api";
import { ICandle, IPolygonCandle } from "../../types/back-test-types";
import {
  CandleSource,
  IDailyAdjustContext,
  IFetchedCandles,
  requestFrequency,
  throwUnexpectedDailyTime,
} from "./candle-source";

export const transformCandles = (candles: IPolygonCandle[]): ICandle[] =>
  candles.map((candle) => ({
    datetime: candle.t,
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v,
  }));

// Polygon stamps daily candles at midnight Eastern time.
export class PolygonCandleSource implements CandleSource {
  async fetch(
    period: PeriodType,
    symbols: string[],
    startTime: number,
    endTime: number,
  ): Promise<IFetchedCandles[]> {
    const timespan = period === PeriodType.DAY ? "day" : "minute";
    const multiplier = String(requestFrequency(period));
    const responses = await Promise.all(
      symbols.map((symbol) =>
        SchwabAPI.getStockHistoryPolygon(symbol, timespan, multiplier, {
          start: String(startTime),
          end: String(endTime),
        }),
      ),
    );
    return responses.map((response) => ({
      empty: response.results.length === 0,
      symbol: response.ticker,
      candles: transformCandles(response.results),
    }));
  }

  adjustDailyCandleTime(
    candle: ICandle,
    mins: number,
    context: IDailyAdjustContext,
  ): number {
    switch (mins) {
      case 0:
        return (
          candle.datetime +
          (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
        );
      case 60:
        if (context.isUTC) {
          context.easternOffsetMin += 60;
          return (
            candle.datetime +
            (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
          );
        }
        return (
          candle.datetime +
          (15 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
        );
      case 120:
        return candle.datetime;
      case 1380:
        if (context.isUTC) {
          context.easternOffsetMin -= 60;
          return (
            candle.datetime +
            (16 * CONSTANTS.MILLIS_IN_HOUR - CONSTANTS.MILLIS_IN_MINUTE)
          );
        }
        return throwUnexpectedDailyTime(mins, candle);
      default:
        return throwUnexpectedDailyTime(mins, candle);
    }
  }
}
