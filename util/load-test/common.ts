/**
 * Shared settings for the load test. See LOAD-TEST.md.
 *
 * The test runs against its own database schema and recorded candles, so it
 * never touches your real data and never calls Schwab while it runs.
 */
import path from "path";
import * as dotenv from "dotenv";
import { PeriodType } from "../../src/shared/constants";

dotenv.config();

export const LOAD_TEST_SCHEMA = process.env.LOAD_TEST_SCHEMA || "stock_app_loadtest";
export const CANDLES_DIR = path.resolve(
  process.env.RECORDED_CANDLES_DIR || path.join(__dirname, "candles"),
);
export const RESULTS_DIR = path.join(__dirname, "results");
export const DEFAULT_PORT = 3101;

/** A back test one simulated user runs: its strategy period, symbols and date range. */
export interface IProfile {
  name: string;
  period: PeriodType;
  symbols: string[];
  startTime: number;
  endTime: number;
}

const BIG_7 = ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"];
const MORE = [
  "AMD", "AVGO", "NFLX", "COST", "JPM", "V", "MA", "UNH", "XOM",
  "LLY", "HD", "PG", "KO", "PEP", "CRM", "ORCL", "ADBE", "INTC",
];

// Fixed ranges, so every run replays the same data.
export const PROFILES: Record<string, IProfile> = {
  small: {
    name: "small",
    period: PeriodType.DAY,
    symbols: BIG_7,
    startTime: Date.parse("2025-11-20T00:00:00-05:00"),
    endTime: Date.parse("2026-11-20T23:59:00-05:00"),
  },
  medium: {
    name: "medium",
    period: PeriodType.THIRTY_MINUTES,
    symbols: [...BIG_7, ...MORE],
    startTime: Date.parse("2026-08-20T00:00:00-04:00"),
    endTime: Date.parse("2026-11-20T23:59:00-05:00"),
  },
};

/** Stops if the schema looks like a real one: the load test creates and drops data freely. */
export const assertLoadTestSchema = (schema = process.env.DB_SCHEMA_NAME) => {
  if (!schema || !schema.endsWith("_loadtest")) {
    throw new Error(
      `Refusing to run against schema "${schema}": the load-test schema's name must end in "_loadtest".`,
    );
  }
};
