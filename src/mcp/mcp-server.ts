import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import BaseError from "../errors/base-error";
import { variableCatalog } from "../engine/variable-catalog";
import { BackTestJobService } from "../services/back-test-job-service";
import { GroupService } from "../services/group-service";
import { RunService } from "../services/run-service";
import { StrategyService } from "../services/strategy-service";
import { TransactionService } from "../services/transaction-service";

export const VARIABLES_URI = "stock-app://variables";

const INTERNAL_ERROR = "Internal server error";

const INSTRUCTIONS = `Stock strategy app: stock groups (lists of symbols), strategies (entry and exit filters on indicators), back tests of a strategy on a group, and live runs that alert on signals.
Ids come from the list tools: list_groups for group ids, list_strategies for strategy ids, list_runs for run ids. Times are Unix milliseconds.
Back tests can take minutes: start_back_test returns a jobId at once; poll get_back_test until it is done or failed.
The resource ${VARIABLES_URI} describes every indicator variable a filter can use and its params.`;

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

/**
 * Runs a tool body. Our own errors (400, 404, 429, the Schwab sign-in 503 …) go back to the
 * client as written, like the REST error middleware; anything else is logged here and the
 * client gets a generic message.
 */
export const toolResult = async (fn: () => Promise<unknown>): Promise<CallToolResult> => {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof BaseError) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
    console.error("[mcp] tool failed:", err);
    return { isError: true, content: [{ type: "text", text: INTERNAL_ERROR }] };
  }
};

const id = (what: string) => z.number().int().positive().describe(what);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

/**
 * The MCP tools and resources, acting for one user. They call the same services as the REST
 * routes, with the same ownership checks. Transport-agnostic: main.ts connects it to stdio.
 */
export const createMcpServer = (userId: number, version = "1.0.0"): McpServer => {
  const server = new McpServer({ name: "stock-app", version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_groups",
    {
      title: "List stock groups",
      description: "Your stock groups: id, name and symbols.",
      annotations: readOnly,
    },
    () => toolResult(() => GroupService.list(userId)),
  );

  server.registerTool(
    "list_strategies",
    {
      title: "List strategies",
      description:
        "Your strategies with their period (minutes per bar; 1440 is a day) and screeners: entry and exit filter groups for buying/selling and shorting/covering.",
      annotations: readOnly,
    },
    () => toolResult(() => StrategyService.list(userId)),
  );

  server.registerTool(
    "list_runs",
    {
      title: "List live runs",
      description:
        "Your active and paused paper simulations, with their strategy, group, status and start time. The status is the database's; this server doesn't run them.",
      annotations: readOnly,
    },
    () =>
      toolResult(async () =>
        // `loaded` describes the web server's memory, not this process's, so it is left out
        (await RunService.listCurrent(userId)).map((run) => {
          const copy: Partial<typeof run> = { ...run };
          delete copy.loaded;
          return copy;
        }),
      ),
  );

  server.registerTool(
    "list_back_test_results",
    {
      title: "List saved back-test results",
      description:
        "Summaries of your completed back tests on a group (return, win rate, trades and max drawdown, all in percent except trades), newest first. Optionally only for some strategies.",
      inputSchema: {
        groupId: id("Group id"),
        strategyIds: z.array(id("Strategy id")).optional().describe("Only these strategies"),
      },
      annotations: readOnly,
    },
    ({ groupId, strategyIds }) =>
      toolResult(() => RunService.backTestResults(userId, groupId, strategyIds?.length ? strategyIds : undefined)),
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions of live runs",
      description: "Closed trades of your paper simulations: symbol, time, profit and percent gain. Runs that aren't yours are left out.",
      inputSchema: {
        runIds: z.array(id("Run id")).min(1).describe("Run ids, from list_runs"),
        since: z.number().int().min(0).default(0).describe("Only trades after this time (Unix ms)"),
      },
      annotations: readOnly,
    },
    ({ runIds, since }) => toolResult(() => TransactionService.list(userId, "simulation", [...new Set(runIds)], since)),
  );

  server.registerTool(
    "start_back_test",
    {
      title: "Start a back test",
      description:
        "Starts a back test of your strategies on your group over [startTime, endTime) and returns a jobId at once; poll get_back_test for the result. Results are also saved, like back tests run in the app (see list_back_test_results). A back test can take minutes.",
      inputSchema: {
        strategyIds: z.array(id("Strategy id")).min(1).describe("Strategy ids, from list_strategies"),
        groupId: id("Group id, from list_groups"),
        startTime: z.number().int().min(0).describe("Start (Unix ms)"),
        endTime: z.number().int().min(0).describe("End (Unix ms); after startTime"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ strategyIds, groupId, startTime, endTime }) =>
      toolResult(() =>
        BackTestJobService.start(userId, { strategyIds: [...new Set(strategyIds)], groupId, startTime, endTime }),
      ),
  );

  server.registerTool(
    "get_back_test",
    {
      title: "Get a back test's status and result",
      description:
        'Status of a back test from start_back_test: "running", "done" or "failed" (with the error). Once done, each strategy\'s trades, wins, win rate, return and max drawdown (percent). Jobs are kept for an hour after they finish, and not across restarts of this server.',
      inputSchema: {
        jobId: z.string().min(1).describe("From start_back_test"),
        includeTrades: z.boolean().default(false).describe("Also return every trade (can be long)"),
      },
      annotations: readOnly,
    },
    ({ jobId, includeTrades }) => toolResult(async () => BackTestJobService.get(userId, jobId, includeTrades)),
  );

  server.registerTool(
    "list_back_test_jobs",
    {
      title: "List back test jobs",
      description: "Back tests started with start_back_test in this server's lifetime, newest first, without results.",
      annotations: readOnly,
    },
    () => toolResult(async () => BackTestJobService.list(userId)),
  );

  // The same content as the resource: many clients don't let the model read resources itself.
  server.registerTool(
    "describe_variables",
    {
      title: "Describe indicator variables",
      description: `Every variable a strategy filter can use, its params, and the filter format (also the resource ${VARIABLES_URI}).`,
      annotations: readOnly,
    },
    () => toolResult(async () => variableCatalog()),
  );

  server.registerResource(
    "variables",
    VARIABLES_URI,
    {
      title: "Indicator variables",
      description: "Every variable a strategy filter can use, its params, and the filter format.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(variableCatalog(), null, 2) }],
    }),
  );

  return server;
};
