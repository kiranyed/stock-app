import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../../errors/error-400";
import {
  create,
  deleteMultiple,
  deleteStrategy,
  edit,
  getAll,
  getAllNames,
  getByName,
} from "../../routers/strategy-router";
import { StrategyService } from "../../services/strategy-service";

jest.mock("../../services/strategy-service");

const service = StrategyService as jest.Mocked<typeof StrategyService>;

const call = async (
  handler: (req: Request, res: Response, next: jest.Mock) => Promise<unknown>,
  req: Partial<Request>,
) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ headers: { "user-id": "7" }, params: {}, query: {}, ...req } as Request, res as unknown as Response, next);
  return { res, next };
};

const strategy = { id: 3, name: "s", description: "", period: 30, screeners: [] };

beforeEach(() => jest.clearAllMocks());

describe("strategy routes", () => {
  it("list strategies and names for the caller, in the shapes the frontend reads", async () => {
    service.list.mockResolvedValue([strategy]);
    const all = await call(getAll, {});
    expect(service.list).toHaveBeenCalledWith(7);
    expect(all.res.json).toHaveBeenCalledWith({ strategies: [strategy] });

    service.listNames.mockResolvedValue([{ id: 3, name: "s" }]);
    const names = await call(getAllNames, {});
    expect(names.res.json).toHaveBeenCalledWith([{ id: 3, name: "s" }]);
  });

  it("get by name uses the caller's id", async () => {
    service.getByNames.mockResolvedValue([strategy]);
    const one = await call(getByName, { query: { name: "s" } });
    expect(service.getByNames).toHaveBeenCalledWith(7, ["s"]);
    expect(one.res.json).toHaveBeenCalledWith({ strategies: [strategy] });

    await call(getByName, { query: { name: ["a", "b"] } });
    expect(service.getByNames).toHaveBeenLastCalledWith(7, ["a", "b"]);

    const bad = await call(getByName, { query: {} });
    expect(bad.next.mock.calls[0][0]).toBeInstanceOf(Error400);
  });

  it("create and edit pass the body; edit takes the id from the path", async () => {
    service.create.mockResolvedValue({ id: 9 });
    const created = await call(create, { body: strategy });
    expect(service.create).toHaveBeenCalledWith(7, strategy);
    expect(created.res.json).toHaveBeenCalledWith({ id: 9 });

    service.update.mockResolvedValue(strategy);
    const edited = await call(edit, { params: { id: "3" }, body: { ...strategy, id: 99 } });
    expect(service.update).toHaveBeenCalledWith(7, 3, { ...strategy, id: 99 });
    expect(edited.res.json).toHaveBeenCalledWith({ msg: "updated strategy: s" });
  });

  it("delete one or several", async () => {
    const one = await call(deleteStrategy, { params: { id: "3" } });
    expect(service.remove).toHaveBeenCalledWith(7, [3]);
    expect(one.res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(one.res.json).toHaveBeenCalledWith({ message: "Deleted strategy" });

    const many = await call(deleteMultiple, { query: { id: ["3", "4"] } });
    expect(service.remove).toHaveBeenLastCalledWith(7, [3, 4]);
    expect(many.res.json).toHaveBeenCalledWith({ message: "Deleted strategies" });
  });

  it("send bad ids and service errors to the error handler", async () => {
    const bad = await call(deleteStrategy, { params: { id: "3; drop table strategy" } });
    expect(bad.next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(service.remove).not.toHaveBeenCalled();

    const failure = new Error("db down");
    service.list.mockRejectedValue(failure);
    const failed = await call(getAll, {});
    expect(failed.next).toHaveBeenCalledWith(failure);
  });
});
