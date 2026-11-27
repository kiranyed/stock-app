import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import Error404 from "../../errors/error-404";
import { createMcpServer, VARIABLES_URI } from "../../mcp/mcp-server";
import { BackTestJobService } from "../../services/back-test-job-service";
import { GroupService } from "../../services/group-service";
import { RunService } from "../../services/run-service";
import { StrategyService } from "../../services/strategy-service";
import { TransactionService } from "../../services/transaction-service";
import { VARIABLES } from "../../engine/variable-catalog";

// Factories, not automocks: an automock loads the real module and everything it imports
// (database, providers, workers).
jest.mock("../../services/group-service", () => ({ GroupService: { list: jest.fn() } }));
jest.mock("../../services/strategy-service", () => ({ StrategyService: { list: jest.fn() } }));
jest.mock("../../services/run-service", () => ({
  RunService: { listCurrent: jest.fn(), backTestResults: jest.fn() },
}));
jest.mock("../../services/transaction-service", () => ({ TransactionService: { list: jest.fn() } }));
jest.mock("../../services/back-test-job-service", () => ({
  BackTestJobService: { start: jest.fn(), get: jest.fn(), list: jest.fn() },
}));

const groups = GroupService as jest.Mocked<typeof GroupService>;
const strategies = StrategyService as jest.Mocked<typeof StrategyService>;
const runs = RunService as jest.Mocked<typeof RunService>;
const transactions = TransactionService as jest.Mocked<typeof TransactionService>;
const backTestJobs = BackTestJobService as jest.Mocked<typeof BackTestJobService>;

const USER = 7;
let client: Client;

beforeEach(async () => {
  jest.clearAllMocks();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(USER).connect(serverSide);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
});

afterEach(() => client.close());

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as ToolResult;
const json = (result: ToolResult) => JSON.parse(result.content[0].text);

describe("MCP server", () => {
  it("lists the read-only tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_groups",
        "list_strategies",
        "list_runs",
        "list_back_test_results",
        "list_transactions",
        "describe_variables",
        "start_back_test",
        "get_back_test",
        "list_back_test_jobs",
      ]),
    );
    for (const name of names.filter((n) => n !== "start_back_test")) {
      expect(tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true);
    }
    expect(tools.find((t) => t.name === "start_back_test")?.annotations?.readOnlyHint).toBe(false);
  });

  it("list_groups returns the user's groups", async () => {
    groups.list.mockResolvedValue([{ id: 1, name: "Tech", symbols: ["AAPL"] }]);
    const result = await call("list_groups");
    expect(groups.list).toHaveBeenCalledWith(USER);
    expect(json(result)).toEqual([{ id: 1, name: "Tech", symbols: ["AAPL"] }]);
  });

  it("list_strategies returns the user's strategies", async () => {
    strategies.list.mockResolvedValue([{ id: 3, name: "Dip", description: "", period: 30, screeners: [] }]);
    expect(json(await call("list_strategies"))).toEqual([
      { id: 3, name: "Dip", description: "", period: 30, screeners: [] },
    ]);
    expect(strategies.list).toHaveBeenCalledWith(USER);
  });

  it("list_runs defaults to simulations and leaves out `loaded`", async () => {
    runs.listCurrent.mockResolvedValue([
      { id: 5, status: "active", loaded: false } as unknown as Awaited<ReturnType<typeof RunService.listCurrent>>[number],
    ]);
    const result = await call("list_runs");
    expect(runs.listCurrent).toHaveBeenCalledWith(USER);
    expect(json(result)).toEqual([{ id: 5, status: "active" }]);
  });

  it("list_back_test_results passes the group and strategies", async () => {
    runs.backTestResults.mockResolvedValue([]);
    await call("list_back_test_results", { groupId: 2, strategyIds: [3, 4] });
    expect(runs.backTestResults).toHaveBeenCalledWith(USER, 2, [3, 4]);
    await call("list_back_test_results", { groupId: 2 });
    expect(runs.backTestResults).toHaveBeenLastCalledWith(USER, 2, undefined);
  });

  it("list_transactions passes simulation run ids and since", async () => {
    transactions.list.mockResolvedValue([]);
    await call("list_transactions", { runIds: [9, 9, 10] });
    expect(transactions.list).toHaveBeenCalledWith(USER, "simulation", [9, 10], 0);
    await call("list_transactions", { runIds: [9], since: 1000 });
    expect(transactions.list).toHaveBeenLastCalledWith(USER, "simulation", [9], 1000);
  });

  it("rejects bad arguments before calling a service", async () => {
    const result = await call("list_back_test_results", { groupId: -1 });
    expect(result.isError).toBe(true);
    expect(runs.backTestResults).not.toHaveBeenCalled();
    expect((await call("list_transactions", { runIds: [] })).isError).toBe(true);
  });

  it("passes our own errors through", async () => {
    runs.backTestResults.mockRejectedValue(new Error404("group not found"));
    const result = await call("list_back_test_results", { groupId: 2 });
    expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "group not found" }] });
  });

  it("hides unexpected errors", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    groups.list.mockRejectedValue(new Error("ER_PARSE_ERROR near 'select * from user'"));
    const result = await call("list_groups");
    expect(result).toMatchObject({ isError: true, content: [{ text: "Internal server error" }] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("serves the variable catalog as a resource and a tool", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain(VARIABLES_URI);
    const { contents } = await client.readResource({ uri: VARIABLES_URI });
    const catalog = JSON.parse((contents[0] as { text: string }).text);
    expect(catalog.variables.map((v: { varName: string }) => v.varName)).toEqual(VARIABLES.map((v) => v.varName));
    expect(json(await call("describe_variables"))).toEqual(catalog);
  });

  it("start_back_test starts a job for the user and returns its id", async () => {
    backTestJobs.start.mockResolvedValue({ jobId: "abc", status: "running" });
    const result = await call("start_back_test", { strategyIds: [4, 4, 6], groupId: 3, startTime: 100, endTime: 200 });
    expect(backTestJobs.start).toHaveBeenCalledWith(USER, { strategyIds: [4, 6], groupId: 3, startTime: 100, endTime: 200 });
    expect(json(result)).toEqual({ jobId: "abc", status: "running" });
  });

  it("start_back_test passes ownership errors through", async () => {
    backTestJobs.start.mockRejectedValue(new Error404("stock group not found"));
    const result = await call("start_back_test", { strategyIds: [4], groupId: 3, startTime: 100, endTime: 200 });
    expect(result).toMatchObject({ isError: true, content: [{ text: "stock group not found" }] });
  });

  it("get_back_test and list_back_test_jobs read the user's jobs", async () => {
    backTestJobs.get.mockReturnValue({ jobId: "abc", status: "done" } as never);
    expect(json(await call("get_back_test", { jobId: "abc" }))).toEqual({ jobId: "abc", status: "done" });
    expect(backTestJobs.get).toHaveBeenCalledWith(USER, "abc", false);
    await call("get_back_test", { jobId: "abc", includeTrades: true });
    expect(backTestJobs.get).toHaveBeenLastCalledWith(USER, "abc", true);

    backTestJobs.get.mockImplementation(() => {
      throw new Error404("back test job not found");
    });
    expect(await call("get_back_test", { jobId: "other" })).toMatchObject({ isError: true });

    backTestJobs.list.mockReturnValue([]);
    expect(json(await call("list_back_test_jobs"))).toEqual([]);
    expect(backTestJobs.list).toHaveBeenCalledWith(USER);
  });
});
