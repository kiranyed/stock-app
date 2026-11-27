/**
 * npm run load-test:record
 *
 * Saves the candles every load-test profile needs, fetched once from the
 * configured provider (Schwab by default), into util/load-test/candles.
 * The files are market data under your data plan's terms: they're
 * gitignored and must not be committed or shared.
 */
import fs from "fs";
import path from "path";
import { CANDLES_DIR, PROFILES } from "./common";
import { DatabaseAPI } from "../../src/shared/services/db-api";
import { createMarketDataProvider } from "../../src/providers/market-data";
import { RecordedMarketData } from "../../src/providers/recorded/recorded-market-data";

const main = async () => {
  await DatabaseAPI.createConnection(); // the Schwab sign-in lives in the database
  const provider = createMarketDataProvider(
    process.env.MARKET_DATA_PROVIDER === "recorded" ? "schwab" : undefined,
  );
  for (const profile of Object.values(PROFILES)) {
    const started = Date.now();
    const responses = await provider.getCandles(
      profile.period,
      profile.symbols,
      profile.startTime,
      profile.endTime,
    );
    let total = 0;
    for (const { symbol, candles } of responses) {
      const file = RecordedMarketData.file(CANDLES_DIR, profile.period, symbol);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(candles));
      total += candles.length;
    }
    console.log(
      `${profile.name}: ${responses.length} symbols, ${total} candles from ${provider.name} in ${Date.now() - started} ms`,
    );
  }
};

main()
  .catch((err) => {
    console.error(`Recording failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => DatabaseAPI.closeConnection().catch(() => undefined));
