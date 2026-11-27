/**
 * npm run load-test:server
 *
 * The app's HTTP server, set up for load testing: the load-test schema,
 * recorded candles, and no Schwab sign-in check or position monitor.
 * Everything a request does is the same code the real server runs.
 */
import { CANDLES_DIR, DEFAULT_PORT, LOAD_TEST_SCHEMA, assertLoadTestSchema } from "./common";

// Before the app's modules load: dotenv won't override these.
process.env.DB_SCHEMA_NAME = LOAD_TEST_SCHEMA;
process.env.MARKET_DATA_PROVIDER = "recorded";
process.env.RECORDED_CANDLES_DIR = CANDLES_DIR;

const boot = async () => {
  assertLoadTestSchema();
  const { DatabaseAPI } = await import("../../src/shared/services/db-api");
  const { default: AppServer } = await import("../../src/startup/app-server");
  const { BackTestPool } = await import("../../src/run/back-test-pool");
  await DatabaseAPI.createConnection();
  BackTestPool.start();
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  new AppServer().start(port);
  console.log(`load-test server: schema ${LOAD_TEST_SCHEMA}, candles from ${CANDLES_DIR}, pid ${process.pid}`);
};

boot().catch((err) => {
  console.error("Startup failed", err);
  process.exit(1);
});
