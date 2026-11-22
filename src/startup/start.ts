import AppServer from "./app-server";
import { SchwabAPI } from "../shared/services/trading-api";
import { PositionMonitorJob } from "../run/position-monitor-job";

import dotenv from "dotenv";
import { DatabaseAPI } from "../shared/services/db-api";
dotenv.config();

const server = new AppServer();


const boot = async () => {
  await DatabaseAPI.createConnection();
  await SchwabAPI.initialize();
  server.start(3001);
  console.debug('booting up');
  
  // 🆕 Start position risk monitor as a separate service
  try {
    await PositionMonitorJob.start();
  } catch (err) {
    console.error("[Startup] Failed to start position monitor job:", err);
  }
};



boot().catch((err) => {
  console.error("Startup failed", err);
  process.exit(1);
});
/* connect using admin credentials, and then clean the strategies that are no longer running */
