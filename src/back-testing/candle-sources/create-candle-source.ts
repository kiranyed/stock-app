import { CandleSource } from "./candle-source";
import { PolygonCandleSource } from "./polygon-candle-source";
import { SchwabCandleSource } from "./schwab-candle-source";

const SOURCES: Record<string, () => CandleSource> = {
  schwab: () => new SchwabCandleSource(),
  polygon: () => new PolygonCandleSource(),
};

export const createCandleSource = (
  name = process.env.CANDLE_SOURCE || "schwab",
): CandleSource => {
  const factory = SOURCES[name.toLowerCase()];
  if (!factory) {
    throw new Error(
      `Unknown CANDLE_SOURCE "${name}". Expected one of: ${Object.keys(SOURCES).join(", ")}`,
    );
  }
  return factory();
};
