import fs from "fs";
import path from "path";
import { BackTestHelper } from "../../back-testing/back-test-helper";
import { SchwabCandleSource } from "../../back-testing/candle-sources/schwab-candle-source";
import { PolygonCandleSource } from "../../back-testing/candle-sources/polygon-candle-source";
import { PeriodType } from "../../shared/constants";
import { SchwabAPI } from "../../shared/services/trading-api";
import { ICandleData, IPolygonCandleResponse } from "../../types/back-test-types";

// Locks in how initCandleData normalizes candle timestamps for each data source,
// machine time zone, and current DST state, using real Schwab responses.
// Jest can't switch time zones mid-run, so each zone only runs in a process started
// with that TZ; `npm test` runs this file a second time under TZ=UTC.

const FIXTURES = path.resolve(__dirname, "../fixtures/schwab-candles");
const load = (name: string): ICandleData =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf-8"));

const daily: Record<string, ICandleData> = {
  AAPL: load("daily-AAPL"),
  MSFT: load("daily-MSFT"),
};
const intraday = {
  dstStart: load("30min-AAPL-dst-start-2026-03"),
  dstEnd: load("30min-AAPL-dst-end-2026-11"),
};

const HOUR_MS = 60 * 60 * 1000;

// Polygon stamps daily bars at midnight Eastern (Schwab: midnight Central) and
// intraday bars at their start time (same as Schwab).
const toPolygon = (data: ICandleData, isDaily: boolean): IPolygonCandleResponse => ({
  ticker: data.symbol,
  queryCount: data.candles.length,
  resultsCount: data.candles.length,
  adjusted: true,
  results: data.candles.map((c) => ({
    t: isDaily ? c.datetime - HOUR_MS : c.datetime,
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    v: c.volume,
  })),
});

type Source = "schwab" | "polygon";

const run = async (
  source: Source,
  period: PeriodType,
  symbols: string[],
  intradayData?: ICandleData,
) => {
  jest
    .spyOn(SchwabAPI, "getHistoryWithBounds")
    .mockImplementation(async (symbol) =>
      period === PeriodType.DAY ? daily[symbol] : (intradayData as ICandleData),
    );
  jest
    .spyOn(SchwabAPI, "getStockHistoryPolygon")
    .mockImplementation(async (symbol) =>
      period === PeriodType.DAY
        ? toPolygon(daily[symbol], true)
        : toPolygon(intradayData as ICandleData, false),
    );

  const helper = new BackTestHelper(
    source === "schwab" ? new SchwabCandleSource() : new PolygonCandleSource(),
  );
  try {
    const result = await helper.initCandleData(
      { startTime: 0, endTime: 1 },
      [period],
      symbols,
    );
    const map = result[period] ?? {};
    return Object.fromEntries(
      Object.entries(map).map(([symbol, entry]) => [
        symbol,
        entry.candles.map(
          (c) =>
            `${new Date(c.datetime).toISOString()} o=${c.open} c=${c.close} v=${c.volume}`,
        ),
      ]),
    );
  } catch (err) {
    return { error: (err as Error).message };
  }
};

// Feeds each source the same absolute timestamps, bypassing the Polygon midnight shift.
const runRawDaily = async (
  source: Source,
  datetimesBySymbol: Record<string, number[]>,
) => {
  const candlesFor = (symbol: string) =>
    datetimesBySymbol[symbol].map((datetime) => ({
      datetime,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 100,
    }));
  jest
    .spyOn(SchwabAPI, "getHistoryWithBounds")
    .mockImplementation(async (symbol) => {
      const candles = candlesFor(symbol);
      return { symbol, empty: candles.length === 0, index: 0, candles };
    });
  jest
    .spyOn(SchwabAPI, "getStockHistoryPolygon")
    .mockImplementation(async (symbol) => {
      const results = candlesFor(symbol).map((c) => ({
        t: c.datetime,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      }));
      return {
        ticker: symbol,
        queryCount: results.length,
        resultsCount: results.length,
        adjusted: true,
        results,
      };
    });

  const helper = new BackTestHelper(
    source === "schwab" ? new SchwabCandleSource() : new PolygonCandleSource(),
  );
  try {
    const result = await helper.initCandleData(
      { startTime: 0, endTime: 1 },
      [PeriodType.DAY],
      Object.keys(datetimesBySymbol),
    );
    return Object.fromEntries(
      Object.entries(result[PeriodType.DAY] ?? {}).map(([symbol, entry]) => [
        symbol,
        entry.candles.map((c) => new Date(c.datetime).toISOString()),
      ]),
    );
  } catch (err) {
    return { error: (err as Error).message };
  }
};

const UNEXPECTED_DAILY_TIMES = {
  "9:30 ET": "2026-01-15T14:30:00Z",
  "16:00 ET": "2026-01-15T21:00:00Z",
  "12:00 ET": "2026-01-15T17:00:00Z",
};

const ZONES = ["America/New_York", "UTC"];
const machineZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NOWS = {
  standardTime: "2026-01-15T17:00:00Z",
  daylightTime: "2026-07-15T16:00:00Z",
};
const SOURCES: Source[] = ["schwab", "polygon"];

describe("BackTestHelper.initCandleData characterization", () => {
  it("runs in one of the covered machine time zones", () => {
    expect(ZONES).toContain(machineZone);
  });

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  for (const zone of ZONES) {
    for (const [nowLabel, now] of Object.entries(NOWS)) {
      for (const source of SOURCES) {
        const describeIfZone = zone === machineZone ? describe : describe.skip;
        describeIfZone(`${source} | machine TZ ${zone} | today in ${nowLabel}`, () => {
          beforeEach(() => {
            jest.useFakeTimers({ now: new Date(now), doNotFake: ["nextTick", "setImmediate"] });
          });

          it("daily candles", async () => {
            expect(
              await run(source, PeriodType.DAY, ["AAPL", "MSFT"]),
            ).toMatchSnapshot();
          });

          for (const [label, data] of Object.entries(intraday)) {
            it(`30-minute candles around ${label}`, async () => {
              expect(
                await run(source, PeriodType.THIRTY_MINUTES, ["AAPL"], data),
              ).toMatchSnapshot();
            });

            it(`hourly candles around ${label}`, async () => {
              expect(
                await run(source, PeriodType.HOUR, ["AAPL"], data),
              ).toMatchSnapshot();
            });
          }

          it("drops symbols with no candles", async () => {
            expect(
              await runRawDaily(source, { AAPL: [], MSFT: [daily.MSFT.candles[0].datetime] }),
            ).toMatchSnapshot();
          });

          for (const [label, iso] of Object.entries(UNEXPECTED_DAILY_TIMES)) {
            it(`daily candle stamped at ${label}`, async () => {
              expect(
                await runRawDaily(source, { AAPL: [Date.parse(iso)] }),
              ).toMatchSnapshot();
            });
          }
        });
      }
    }
  }
});
