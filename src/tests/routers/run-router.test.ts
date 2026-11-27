import { Request, RequestHandler, Response } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../../errors/error-400";
import {
  endSimulation,
  getBacktestResults,
  getCurrentSimulations,
  getRuns,
  getRunVars,
  pauseSimulation,
  resumeSimulation,
  runSimulations,
  runTests,
} from "../../routers/run-router";
import { RunService } from "../../services/run-service";

jest.mock("../../services/run-service", () => ({
  RunService: {
    backTest: jest.fn(),
    backTestResults: jest.fn(),
    start: jest.fn(),
    listCurrent: jest.fn(),
    getRuns: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    end: jest.fn(),
    getVars: jest.fn(),
  },
}));

const service = RunService as jest.Mocked<typeof RunService>;

const call = async (handler: RequestHandler, req: Partial<Request>) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler(
    { headers: { "user-id": "7" }, params: {}, query: {}, body: {}, ...req } as Request,
    res as unknown as Response,
    next,
  );
  return { res, next, body: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
};

beforeEach(() => jest.clearAllMocks());

describe("run routes", () => {
  describe("back tests", () => {
    const query = { strategyId: "4", groupId: "3", startTime: "100", endTime: "200" };

    it("runs one or several strategies for the caller and returns the gains", async () => {
      service.backTest.mockResolvedValue(["gains"] as never);
      const { res, body } = await call(runTests, { query });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(body).toEqual(["gains"]);
      expect(service.backTest).toHaveBeenCalledWith(7, { strategyIds: [4], groupId: 3, startTime: 100, endTime: 200 });

      await call(runTests, { query: { ...query, strategyId: ["4", "5", "4"] } });
      expect(service.backTest).toHaveBeenLastCalledWith(7, expect.objectContaining({ strategyIds: [4, 5] }));
    });

    it.each([
      ["no strategy", { ...query, strategyId: undefined }],
      ["a bad strategy id", { ...query, strategyId: "1 or 1=1" }],
      ["two groups", { ...query, groupId: ["1", "2"] }],
      ["no group", { ...query, groupId: undefined }],
      ["no start time", { ...query, startTime: undefined }],
      ["a non-numeric end time", { ...query, endTime: "soon" }],
    ])("rejects %s with a 400", async (_, q) => {
      const { error } = await call(runTests, { query: q as never });
      expect(error).toBeInstanceOf(Error400);
      expect(service.backTest).not.toHaveBeenCalled();
    });

    it("lists the caller's results, optionally by strategy", async () => {
      service.backTestResults.mockResolvedValue([]);
      await call(getBacktestResults, { query: { groupId: "3" } });
      expect(service.backTestResults).toHaveBeenCalledWith(7, 3, undefined);
      await call(getBacktestResults, { query: { groupId: "3", strategyId: ["4", "5"] } });
      expect(service.backTestResults).toHaveBeenLastCalledWith(7, 3, [4, 5]);

      for (const q of [{}, { groupId: "x" }, { groupId: "3", strategyId: "-1" }]) {
        expect((await call(getBacktestResults, { query: q })).error).toBeInstanceOf(Error400);
      }
    });
  });

  describe("live runs", () => {
    it("starts paper simulations", async () => {
      service.start.mockResolvedValue([{ id: 1 }] as never);
      const { body } = await call(runSimulations, { query: { strategyId: "4", groupId: "3", notify: "true" } });
      expect(body).toEqual({ runs: [{ id: 1 }] });
      expect(service.start).toHaveBeenCalledWith(7, { strategyIds: [4], groupId: 3, notifyOnEntry: true });
    });

    it("lists the caller's current simulations", async () => {
      service.listCurrent.mockResolvedValue([]);
      await call(getCurrentSimulations, {});
      expect(service.listCurrent).toHaveBeenCalledWith(7);
    });

    it("pauses, resumes and ends simulations by numeric id", async () => {
      expect((await call(pauseSimulation, { body: { id: 5 } })).body).toBe("Paused simulation run with id: 5");
      expect(service.pause).toHaveBeenCalledWith(7, 5);
      expect((await call(resumeSimulation, { body: { id: 5 } })).body).toBe("Resumed simulation with id: 5");
      expect((await call(endSimulation, { body: { id: 5 } })).body).toBe("Ended simulation with id: 5");
    });

    it("rejects a missing or bad run id", async () => {
      for (const body of [{}, { id: "abc" }, { id: 0 }]) {
        expect((await call(pauseSimulation, { body })).error).toBeInstanceOf(Error400);
      }
      expect((await call(endSimulation, { body: undefined })).error).toBeInstanceOf(Error400);
      expect(service.pause).not.toHaveBeenCalled();
    });

    it("passes service errors on", async () => {
      const err = new Error("boom");
      service.end.mockRejectedValue(err);
      expect((await call(endSimulation, { body: { id: 5 } })).error).toBe(err);
    });

    it("gets the caller's runs, treating no ids as none", async () => {
      service.getRuns.mockResolvedValue([]);
      expect((await call(getRuns, { query: { id: ["1", "2"] } })).body).toEqual({ arr: [] });
      expect(service.getRuns).toHaveBeenCalledWith(7, [1, 2]);
      await call(getRuns, { query: { id: "" } });
      expect(service.getRuns).toHaveBeenLastCalledWith(7, []);
    });

    it("gets a run's vars", async () => {
      service.getVars.mockResolvedValue({ runId: 5, vars: {} } as never);
      expect((await call(getRunVars, { query: { runId: "5" } })).body).toEqual({ runId: 5, vars: {} });
      expect(service.getVars).toHaveBeenCalledWith(7, 5);
      expect((await call(getRunVars, { query: {} })).error).toBeInstanceOf(Error400);
      expect((await call(getRunVars, { query: { runId: "0" } })).error).toBeInstanceOf(Error400);
    });
  });
});
