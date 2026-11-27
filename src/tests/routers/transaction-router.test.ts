import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../../errors/error-400";
import { getSimulationTransactions } from "../../routers/transaction-router";
import { TransactionService } from "../../services/transaction-service";

jest.mock("../../services/transaction-service");

const list = TransactionService.list as jest.Mock;

const call = async (handler: typeof getSimulationTransactions, query: Record<string, unknown>) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ headers: { "user-id": "7" }, query } as unknown as Request, res as unknown as Response, next);
  return { res, body: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
};

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue([{ runId: 1 }]);
});

describe("transaction routes", () => {
  it("lists the caller's simulation transactions under simTransactions", async () => {
    const { res, body } = await call(getSimulationTransactions, { runId: ["1", "2"], pingTime: "500" });
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(body).toEqual({ simTransactions: [{ runId: 1 }] });
    expect(list).toHaveBeenCalledWith(7, "simulation", [1, 2], 500);
  });

  it.each([
    ["no runId", { pingTime: "0" }],
    ["a runId that isn't a number", { runId: "1) or (1=1", pingTime: "0" }],
    ["no pingTime", { runId: "1" }],
    ["a negative pingTime", { runId: "1", pingTime: "-5" }],
    ["two pingTimes", { runId: "1", pingTime: ["1", "2"] }],
  ])("rejects %s with a 400", async (_, query) => {
    const { error } = await call(getSimulationTransactions, query);
    expect(error).toBeInstanceOf(Error400);
    expect(list).not.toHaveBeenCalled();
  });
});
