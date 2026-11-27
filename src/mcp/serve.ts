import { Writable } from "stream";
import * as dotenv from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseAPI } from "../shared/services/db-api";
import { BackTestPool } from "../run/back-test-pool";
import { UserService } from "../services/user-service";
import { createMcpServer } from "./mcp-server";

/** Connects to the database, picks the user, and serves MCP on stdin and `out`. Started by main.ts. */
export const serve = async (out: Writable) => {
  dotenv.config({ quiet: true });
  await DatabaseAPI.createConnection();
  const user = await UserService.resolveLocalUser({
    id: process.env.MCP_USER_ID,
    username: process.env.MCP_USERNAME,
  });
  BackTestPool.start();

  const server = createMcpServer(user.id, process.env.npm_package_version);
  const transport = new StdioServerTransport(process.stdin, out);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
    await DatabaseAPI.closeConnection().catch(() => undefined);
    process.exit(0);
  };
  transport.onclose = shutdown;
  process.stdin.on("end", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
  console.error(`[mcp] stock-app MCP server ready on stdio, acting for ${user.username} (id ${user.id})`);
};
