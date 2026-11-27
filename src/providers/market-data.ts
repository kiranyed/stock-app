import { MarketDataProvider } from "./market-data-provider";
import { MassiveMarketData } from "./massive/massive-market-data";
import { SchwabMarketData } from "./schwab/schwab-market-data";
import { RecordedMarketData } from "./recorded/recorded-market-data";

const PROVIDERS: Record<string, () => MarketDataProvider> = {
  schwab: () => new SchwabMarketData(),
  massive: () => new MassiveMarketData(),
  polygon: () => new MassiveMarketData(),
  recorded: () => new RecordedMarketData(),
};

/** The provider named by MARKET_DATA_PROVIDER (or the older CANDLE_SOURCE); Schwab by default. */
export const createMarketDataProvider = (
  name = process.env.MARKET_DATA_PROVIDER || process.env.CANDLE_SOURCE || "schwab",
): MarketDataProvider => {
  const factory = PROVIDERS[name.toLowerCase()];
  if (!factory) {
    throw new Error(
      `Unknown market data provider "${name}". Expected one of: schwab, massive, recorded`,
    );
  }
  return factory();
};

let current: MarketDataProvider | undefined;

/** The app's market data provider, created on first use. */
export const marketData = (): MarketDataProvider => (current ??= createMarketDataProvider());

/** Forgets the current provider, so the next `marketData()` reads the setting again (tests). */
export const resetMarketData = () => {
  current = undefined;
};
