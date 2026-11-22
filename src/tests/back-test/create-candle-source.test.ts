import { createCandleSource } from "../../back-testing/candle-sources/create-candle-source";
import { PolygonCandleSource } from "../../back-testing/candle-sources/polygon-candle-source";
import { SchwabCandleSource } from "../../back-testing/candle-sources/schwab-candle-source";

describe("createCandleSource", () => {
  const original = process.env.CANDLE_SOURCE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CANDLE_SOURCE;
    } else {
      process.env.CANDLE_SOURCE = original;
    }
  });

  it("defaults to Schwab when CANDLE_SOURCE is unset", () => {
    delete process.env.CANDLE_SOURCE;
    expect(createCandleSource()).toBeInstanceOf(SchwabCandleSource);
  });

  it("uses CANDLE_SOURCE, ignoring case", () => {
    process.env.CANDLE_SOURCE = "Polygon";
    expect(createCandleSource()).toBeInstanceOf(PolygonCandleSource);
  });

  it("rejects an unknown source", () => {
    expect(() => createCandleSource("alpaca")).toThrow(
      'Unknown CANDLE_SOURCE "alpaca". Expected one of: schwab, polygon',
    );
  });
});
