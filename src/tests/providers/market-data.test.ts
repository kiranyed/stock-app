import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { PeriodType } from "../../shared/constants";
import { createMarketDataProvider } from "../../providers/market-data";
import { READ_TIMEOUT_MS, periodLabel } from "../../providers/market-data-provider";
import { dailyCandleTime, toHourlyCandles, zonedTime } from "../../providers/candles";
import { SchwabMarketData } from "../../providers/schwab/schwab-market-data";
import { SchwabClient } from "../../providers/schwab/schwab-client";
import { MassiveMarketData } from "../../providers/massive/massive-market-data";
import { MassiveClient } from "../../providers/massive/massive-client";
import { RecordedMarketData } from "../../providers/recorded/recorded-market-data";

jest.mock("axios");

const NOW = Date.UTC(2026, 10, 20, 15, 0);
const iso = (t: number) => new Date(t).toISOString();

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("createMarketDataProvider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to Schwab", () => {
    delete process.env.MARKET_DATA_PROVIDER;
    delete process.env.CANDLE_SOURCE;
    expect(createMarketDataProvider()).toBeInstanceOf(SchwabMarketData);
  });

  it("reads MARKET_DATA_PROVIDER first, then CANDLE_SOURCE; polygon means Massive", () => {
    process.env.CANDLE_SOURCE = "polygon";
    delete process.env.MARKET_DATA_PROVIDER;
    expect(createMarketDataProvider()).toBeInstanceOf(MassiveMarketData);
    process.env.MARKET_DATA_PROVIDER = "Schwab";
    expect(createMarketDataProvider()).toBeInstanceOf(SchwabMarketData);
  });

  it("rejects unknown names", () => {
    expect(() => createMarketDataProvider("alpaca")).toThrow(/Unknown market data provider "alpaca"/);
  });
});

describe("daily candle times", () => {
  it.each([
    ["winter", "2026-01-14T06:00:00Z", "2026-01-14T20:59:00.000Z"],
    ["summer", "2026-07-14T05:00:00Z", "2026-07-14T19:59:00.000Z"],
    ["the Monday after DST starts", "2026-03-09T05:00:00Z", "2026-03-09T19:59:00.000Z"],
    ["the Monday after DST ends", "2026-11-02T06:00:00Z", "2026-11-02T20:59:00.000Z"],
  ])("moves Schwab's midnight Central stamp to 15:59 Eastern (%s)", (_, stamp, expected) => {
    expect(iso(dailyCandleTime(Date.parse(stamp), "America/Chicago"))).toBe(expected);
  });

  it.each([
    ["winter", "2026-01-14T05:00:00Z", "2026-01-14T20:59:00.000Z"],
    ["summer", "2026-07-14T04:00:00Z", "2026-07-14T19:59:00.000Z"],
  ])("moves Massive's midnight Eastern stamp to 15:59 Eastern (%s)", (_, stamp, expected) => {
    expect(iso(dailyCandleTime(Date.parse(stamp), "America/New_York"))).toBe(expected);
  });

  it.each([
    ["winter", "2026-11-23T05:00:00Z", "2026-11-23T20:59:00.000Z"],
    ["summer", "2026-07-14T04:00:00Z", "2026-07-14T19:59:00.000Z"],
  ])("accepts Schwab's current-day candle, stamped at midnight Eastern (%s)", (_, stamp, expected) => {
    // read as Central it would be 23:00 the day before
    expect(iso(dailyCandleTime(Date.parse(stamp), "America/Chicago"))).toBe(expected);
  });

  it("rejects a daily candle that isn't stamped at midnight", () => {
    expect(() => dailyCandleTime(Date.parse("2026-01-14T14:30:00Z"), "America/New_York")).toThrow(
      /midnight America\/New_York, got 2026-01-14T14:30:00.000Z/,
    );
  });

  it("finds wall-clock times on both DST change days", () => {
    const at = (day: number, month: number) =>
      iso(zonedTime({ year: 2026, month, day, hour: 15, minute: 59 }, "America/New_York"));
    expect(at(8, 3)).toBe("2026-03-08T19:59:00.000Z");
    expect(at(1, 11)).toBe("2026-11-01T20:59:00.000Z");
  });
});

describe("hourly candles", () => {
  const et = (hhmm: string) => Date.parse(`2026-01-14T${hhmm}:00-05:00`);
  const half = (hhmm: string, open: number, high: number, low: number, close: number, volume: number) => ({
    datetime: et(hhmm),
    open,
    high,
    low,
    close,
    volume,
  });

  it("merges each :30 candle with the :00 candle after it", () => {
    const hours = toHourlyCandles([
      half("09:30", 10, 12, 9, 11, 100),
      half("10:00", 11, 15, 10, 14, 50),
      half("10:30", 14, 14, 8, 9, 70),
      half("11:00", 9, 10, 7, 8, 30),
    ]);
    expect(hours).toEqual([
      { datetime: et("09:30"), open: 10, high: 15, low: 9, close: 14, volume: 150 },
      { datetime: et("10:30"), open: 14, high: 14, low: 7, close: 8, volume: 100 },
    ]);
  });

  it("builds an hour from the half that's there, and keeps the session's last half hour", () => {
    const hours = toHourlyCandles([
      half("11:00", 9, 10, 7, 8, 30),
      half("15:30", 20, 21, 19, 20.5, 40),
    ]);
    expect(hours.map((h) => [new Date(h.datetime).toISOString(), h.close, h.volume])).toEqual([
      ["2026-01-14T15:30:00.000Z", 8, 30],
      ["2026-01-14T20:30:00.000Z", 20.5, 40],
    ]);
  });

  it("doesn't change the candles it's given", () => {
    const input = [half("09:30", 10, 12, 9, 11, 100), half("10:00", 11, 15, 10, 14, 50)];
    const copy = JSON.parse(JSON.stringify(input));
    toHourlyCandles(input);
    expect(input).toEqual(copy);
  });
});

describe("SchwabMarketData.getQuotes", () => {
  const quote = (symbol: string, lastPrice: number, totalVolume = 1000) => ({
    symbol,
    quote: { lastPrice, totalVolume, highPrice: 0, lowPrice: 0 },
  });

  it("asks in batches, skips a failed batch, and keeps the first quote per symbol", async () => {
    const getQuotes = jest
      .spyOn(SchwabClient, "getQuotes")
      .mockResolvedValueOnce({ A: quote("A", 1), B: quote("B", 2) })
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce({ A: quote("A", 99), E: quote("E", 5) });
    const provider = new SchwabMarketData({ quoteBatchSize: 2, quoteBatchDelayMs: 0 });

    const quotes = await provider.getQuotes(["A", "B", "C", "D", "E"]);

    expect(getQuotes.mock.calls).toEqual([["A,B"], ["C,D"], ["E"]]);
    expect(quotes).toEqual([
      { symbol: "A", price: 1, volume: 1000, totalVolume: 1000, datetime: NOW },
      { symbol: "B", price: 2, volume: 1000, totalVolume: 1000, datetime: NOW },
      { symbol: "E", price: 5, volume: 1000, totalVolume: 1000, datetime: NOW },
    ]);
  });

  it("throws when every batch fails, so the scheduler counts the tick as failed", async () => {
    jest.spyOn(SchwabClient, "getQuotes").mockRejectedValue(new Error("sign in again"));
    const provider = new SchwabMarketData({ quoteBatchSize: 2, quoteBatchDelayMs: 0 });
    await expect(provider.getQuotes(["A", "B", "C"])).rejects.toThrow("sign in again");
    await expect(provider.getQuotes([])).resolves.toEqual([]);
  });

  it("leaves out symbols Schwab returns without a quote", async () => {
    jest.spyOn(SchwabClient, "getQuotes").mockResolvedValue({
      A: quote("A", 1),
      BAD: { symbol: "BAD" } as never,
    });
    expect((await new SchwabMarketData().getQuotes(["A", "BAD"])).map((q) => q.symbol)).toEqual(["A"]);
  });
});

describe("MassiveMarketData", () => {
  const bar = (t: number, c: number) => ({ t, o: c, h: c + 1, l: c - 1, c, v: 100 });

  it("turns aggregates into candles, with daily ones at 15:59 Eastern", async () => {
    const aggregates = jest.spyOn(MassiveClient, "getAggregates").mockResolvedValue({
      ticker: "AAPL",
      queryCount: 1,
      resultsCount: 1,
      adjusted: true,
      results: [bar(Date.parse("2026-01-14T05:00:00Z"), 10)],
    });

    const [result] = await new MassiveMarketData().getCandles(PeriodType.DAY, ["AAPL"], 1, 2);

    expect(aggregates).toHaveBeenCalledWith("AAPL", "day", "1", { start: "1", end: "2" });
    expect(result).toEqual({
      symbol: "AAPL",
      empty: false,
      candles: [
        { datetime: Date.parse("2026-01-14T20:59:00Z"), open: 10, high: 11, low: 9, close: 10, volume: 100 },
      ],
    });
  });

  it("asks for 30-minute aggregates for hourly candles", async () => {
    const aggregates = jest.spyOn(MassiveClient, "getAggregates").mockResolvedValue({
      ticker: "AAPL",
      queryCount: 0,
      resultsCount: 0,
      adjusted: true,
      results: [],
    });
    const [result] = await new MassiveMarketData().getCandles(PeriodType.HOUR, ["AAPL"], 1, 2);
    expect(aggregates).toHaveBeenCalledWith("AAPL", "minute", "30", { start: "1", end: "2" });
    expect(result.empty).toBe(true);
  });

  it.each([
    ["winter", "2026-01-14", "-05:00"],
    ["summer", "2026-07-14", "-04:00"],
  ])("drops pre-market and after-hours minute candles (%s)", async (_, date, offset) => {
    const at = (hhmm: string) => Date.parse(`${date}T${hhmm}:00${offset}`);
    const times = ["04:00", "09:29", "09:30", "12:00", "15:59", "16:00", "19:59"];
    jest.spyOn(MassiveClient, "getAggregates").mockResolvedValue({
      ticker: "AAPL",
      queryCount: times.length,
      resultsCount: times.length,
      adjusted: true,
      results: times.map((t) => bar(at(t), 10)),
    });

    const [result] = await new MassiveMarketData().getCandles(PeriodType.MINUTE, ["AAPL"], 1, 2);

    expect(result.candles.map((c) => c.datetime)).toEqual(["09:30", "12:00", "15:59"].map(at));
  });

  it("keeps the session on DST change days and marks a symbol with only after-hours trades empty", async () => {
    const results = [
      bar(Date.parse("2026-03-09T13:30:00Z"), 1), // 9:30 EDT, the day after DST starts
      bar(Date.parse("2026-11-02T14:29:00Z"), 1), // 9:29 EST, the day after DST ends
      bar(Date.parse("2026-11-02T14:30:00Z"), 1), // 9:30 EST
    ];
    jest
      .spyOn(MassiveClient, "getAggregates")
      .mockResolvedValueOnce({ ticker: "AAPL", queryCount: 3, resultsCount: 3, adjusted: true, results })
      .mockResolvedValueOnce({
        ticker: "LATE",
        queryCount: 1,
        resultsCount: 1,
        adjusted: true,
        results: [bar(Date.parse("2026-01-14T22:00:00Z"), 1)],
      });

    const [aapl, late] = await new MassiveMarketData().getCandles(PeriodType.MINUTE, ["AAPL", "LATE"], 1, 2);

    expect(aapl.candles.map((c) => new Date(c.datetime).toISOString())).toEqual([
      "2026-03-09T13:30:00.000Z",
      "2026-11-02T14:30:00.000Z",
    ]);
    expect(late).toEqual({ symbol: "LATE", empty: true, candles: [] });
  });

  it("reads quotes from snapshots: last trade, then the minute or day close", async () => {
    jest.spyOn(MassiveClient, "getSnapshots").mockResolvedValue([
      { ticker: "A", lastTrade: { p: 10 }, min: { c: 9, av: 500 }, day: { c: 8, v: 400 } },
      { ticker: "B", day: { c: 20, v: 300 } },
      { ticker: "C" },
    ]);
    expect(await new MassiveMarketData().getQuotes(["A", "B", "C"])).toEqual([
      { symbol: "A", price: 10, volume: 500, totalVolume: 500, datetime: NOW },
      { symbol: "B", price: 20, volume: 300, totalVolume: 300, datetime: NOW },
    ]);
  });

  it("is open only during the regular session", async () => {
    const status = jest.spyOn(MassiveClient, "getMarketStatus");
    status.mockResolvedValueOnce("open").mockResolvedValueOnce("extended-hours");
    expect(await new MassiveMarketData().isMarketOpen()).toBe(true);
    expect(await new MassiveMarketData().isMarketOpen()).toBe(false);
  });
});

describe("MassiveClient", () => {
  const get = axios.get as jest.Mock;
  const saved = { ...process.env };
  beforeEach(() => {
    get.mockReset();
    process.env.MASSIVE_API_KEY = "massive-key";
    delete process.env.MASSIVE_API_URL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("follows next_url, sending the key on every page", async () => {
    get
      .mockResolvedValueOnce({ data: { ticker: "AAPL", results: [{ t: 1 }], next_url: "https://api.massive.com/next?cursor=x" } })
      .mockResolvedValueOnce({ data: { ticker: "AAPL", results: [{ t: 2 }] } });

    const response = await MassiveClient.getAggregates("AAPL", "minute", "1", { start: 10, end: 20 });

    expect(get.mock.calls[0][0]).toBe("https://api.massive.com/v2/aggs/ticker/AAPL/range/1/minute/10/20");
    expect(get.mock.calls[0][1].params).toEqual({ limit: 50000, adjusted: true, sort: "asc", apiKey: "massive-key" });
    expect(get.mock.calls[1]).toEqual(["https://api.massive.com/next?cursor=x", { params: { apiKey: "massive-key" }, timeout: READ_TIMEOUT_MS }]);
    expect(response.results).toEqual([{ t: 1 }, { t: 2 }]);
  });

  it("falls back to POLYGON_KEY, and says which setting is missing", async () => {
    delete process.env.MASSIVE_API_KEY;
    process.env.POLYGON_KEY = "old-key";
    get.mockResolvedValue({ data: { market: "open" } });
    await MassiveClient.getMarketStatus();
    expect(get.mock.calls[0][1].params.apiKey).toBe("old-key");

    delete process.env.POLYGON_KEY;
    await expect(MassiveClient.getMarketStatus()).rejects.toThrow(/MASSIVE_API_KEY/);
  });
});

describe("capabilities", () => {
  const ALL = [1, 5, 10, 30, 60, 1440];

  it("Schwab serves every period in real time, for the account holder to see", () => {
    expect(new SchwabMarketData().capabilities).toEqual({ periods: ALL, realTime: true, displayPrices: true });
  });

  it("Massive serves every period, treated as delayed, for the subscriber to see", () => {
    expect(new MassiveMarketData().capabilities).toEqual({ periods: ALL, realTime: false, displayPrices: true });
  });

  it("periodLabel names periods for messages", () => {
    expect(periodLabel(PeriodType.DAY)).toBe("daily");
    expect(periodLabel(PeriodType.FIVE_MINUTES)).toBe("5-minute");
  });
});

describe("RecordedMarketData", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recorded-"));
  const candle = (datetime: number) => ({ datetime, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
  beforeAll(() => {
    const file = RecordedMarketData.file(dir, PeriodType.DAY, "AAPL");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([candle(100), candle(200), candle(300)]));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("serves the saved candles inside the range, and nothing for unknown symbols", async () => {
    const provider = new RecordedMarketData(dir);
    const [aapl, none] = await provider.getCandles(PeriodType.DAY, ["AAPL", "NONE"], 150, 300);
    expect(aapl).toEqual({ symbol: "AAPL", empty: false, candles: [candle(200), candle(300)] });
    expect(none).toEqual({ symbol: "NONE", empty: true, candles: [] });
    expect(await provider.getQuotes()).toEqual([]);
    expect(await provider.isMarketOpen()).toBe(false);
  });

  it("serves only the periods it has recordings for; no live quotes, and prices aren't for showing", () => {
    const provider = new RecordedMarketData(dir);
    expect(provider.capabilities).toEqual({ periods: [PeriodType.DAY], realTime: false, displayPrices: false });

    // a recording made later counts, and other folders don't
    fs.mkdirSync(path.join(dir, String(PeriodType.THIRTY_MINUTES)));
    fs.mkdirSync(path.join(dir, "notes"));
    expect(provider.capabilities.periods).toEqual([PeriodType.THIRTY_MINUTES, PeriodType.DAY]);

    expect(new RecordedMarketData(path.join(dir, "missing")).capabilities.periods).toEqual([]);
  });

  it("needs a directory", () => {
    const saved = process.env.RECORDED_CANDLES_DIR;
    delete process.env.RECORDED_CANDLES_DIR;
    expect(() => new RecordedMarketData()).toThrow(/RECORDED_CANDLES_DIR/);
    if (saved !== undefined) process.env.RECORDED_CANDLES_DIR = saved;
  });
});
