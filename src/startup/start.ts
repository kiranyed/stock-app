import AppServer from "./app-server";
import { SchwabAuth } from "../providers/schwab/schwab-auth";

import dotenv from "dotenv";
import { DatabaseAPI } from "../shared/services/db-api";
import { RunService } from "../services/run-service";
import { BackTestPool } from "../run/back-test-pool";
import { AlertOutbox } from "../notify/alert-outbox";
dotenv.config();

const server = new AppServer();


const boot = async () => {
  const bootTime = Date.now();
  await DatabaseAPI.createConnection();
  await SchwabAuth.initialize();
  BackTestPool.start();
  AlertOutbox.start();
  server.start(3001);
  console.debug('booting up');

  // not awaited: warming up every group can take minutes, and nothing else should wait for it
  RunService.restoreRuns(bootTime).catch((err) => console.error("[Startup] Failed to reload runs:", err));
};



boot().catch((err) => {
  console.error("Startup failed", err);
  process.exit(1);
});
/* connect using admin credentials, and then clean the strategies that are no longer running */
