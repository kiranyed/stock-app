import BaseError from "../../errors/base-error";
import Error400 from "../../errors/error-400";
import { BackTestService } from "../../run/back-test-service";
import { BackTestTask, fromWire, runBackTestTask, toWire } from "../../run/back-test-task";
import { AnalysisBackTestFactory } from "../../factory/analysis-back-test-factory";
import { BackTestFactory } from "../../factory/back-test-factory";
import { VariableCheckBackTest } from "../../analysis/variable-check-back-test";
import { PeriodType } from "../../shared/constants";

jest.mock("../../run/back-test-service");
jest.mock("../../factory/analysis-back-test-factory");
jest.mock("../../factory/back-test-factory");
jest.mock("../../analysis/variable-check-back-test");

const group = { id: 3, name: "G", symbols: ["A"] };
const config = { startTime: 1, endTime: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  (BackTestService.runBackTests as jest.Mock).mockResolvedValue(["results"]);
});

describe("runBackTestTask", () => {
  it("builds one back test per strategy", async () => {
    (BackTestFactory.createBackTestInstance as jest.Mock).mockImplementation((_t, s) => ({ job: s.id }));
    const task = { kind: "strategies", strategies: [{ id: 4 }, { id: 6 }], group, config } as unknown as BackTestTask;
    await expect(runBackTestTask(task)).resolves.toEqual(["results"]);
    expect(BackTestService.runBackTests).toHaveBeenCalledWith([{ job: 4 }, { job: 6 }], group, config);
  });

  it("builds the analysis from its filters", async () => {
    (AnalysisBackTestFactory.createAnalysisBackTest as jest.Mock).mockReturnValue({ job: "analysis" });
    const scenarioFilterGroup = { filters: [], connectors: [] };
    await runBackTestTask({ kind: "analysis", period: PeriodType.DAY, scenarioFilterGroup, dataFilters: [], group, config });
    expect(AnalysisBackTestFactory.createAnalysisBackTest).toHaveBeenCalledWith(PeriodType.DAY, scenarioFilterGroup, []);
    expect(BackTestService.runBackTests).toHaveBeenCalledWith([{ job: "analysis" }], group, config);
  });

  it("builds the variable check from its variables", async () => {
    const variables = [{ varName: "rsi" }] as never;
    await runBackTestTask({ kind: "variables", variables, group, config });
    expect(VariableCheckBackTest).toHaveBeenCalledWith(variables);
    expect(BackTestService.runBackTests).toHaveBeenCalledWith(
      [expect.any(VariableCheckBackTest)],
      group,
      config,
    );
  });

  it("rejects, rather than throws, when a job can't be built", async () => {
    (BackTestFactory.createBackTestInstance as jest.Mock).mockImplementation(() => {
      throw new Error400("bad filter");
    });
    const task = { kind: "strategies", strategies: [{ id: 4 }], group, config } as unknown as BackTestTask;
    await expect(runBackTestTask(task)).rejects.toThrow("bad filter");
  });
});

describe("errors across the thread boundary", () => {
  it("keep a BaseError's status and message", () => {
    const err = fromWire(toWire(new Error400("bad filter")));
    expect(err).toBeInstanceOf(BaseError);
    expect(err).toMatchObject({ statusCode: 400, message: "bad filter" });
  });

  it("leave other errors without a status, so they become a generic 500", () => {
    const err = fromWire(toWire(new TypeError("x is undefined")));
    expect(err).not.toBeInstanceOf(BaseError);
    expect(err.message).toBe("x is undefined");
    expect(err.stack).toContain("TypeError");
  });

  it("handle something thrown that isn't an Error", () => {
    expect(toWire("boom")).toMatchObject({ message: "boom", statusCode: undefined });
  });
});
