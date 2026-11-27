import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import Error400 from "../../errors/error-400";
import {
  createStockGroup,
  deleteGroup,
  deleteGroups,
  getStockGroupNames,
  getStockGroups,
  saveStockGroup,
} from "../../routers/group-router";
import { GroupService } from "../../services/group-service";

jest.mock("../../services/group-service", () => ({
  ...jest.requireActual("../../services/group-service"),
  GroupService: {
    listNames: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

const service = GroupService as jest.Mocked<typeof GroupService>;

const call = async (
  handler: (req: Request, res: Response, next: jest.Mock) => Promise<unknown>,
  req: Partial<Request>,
) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await handler({ headers: { "user-id": "7" }, params: {}, query: {}, ...req } as Request, res as unknown as Response, next);
  return { res, next };
};

beforeEach(() => jest.clearAllMocks());

describe("group routes", () => {
  it("list names and groups for the caller", async () => {
    service.listNames.mockResolvedValue([{ id: 1, name: "A" }]);
    const names = await call(getStockGroupNames, {});
    expect(service.listNames).toHaveBeenCalledWith(7);
    expect(names.res.json).toHaveBeenCalledWith([{ id: 1, name: "A" }]);

    service.list.mockResolvedValue([]);
    await call(getStockGroups, {});
    expect(service.list).toHaveBeenCalledWith(7);
  });

  it("create passes the body and returns the new group", async () => {
    service.create.mockResolvedValue({ id: 5, name: "A", symbols: ["X"] });
    const { res } = await call(createStockGroup, { body: { name: "A", symbols: ["X"] } });
    expect(service.create).toHaveBeenCalledWith(7, { name: "A", symbols: ["X"] });
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ id: 5, name: "A", symbols: ["X"] });
  });

  it("update takes the id from the path", async () => {
    service.update.mockResolvedValue({ id: 3, name: "A", symbols: [] });
    await call(saveStockGroup, { params: { id: "3" }, body: { id: 99, name: "A", symbols: [] } });
    expect(service.update).toHaveBeenCalledWith(7, 3, { id: 99, name: "A", symbols: [] });
  });

  it("delete one or several, answering 204", async () => {
    const one = await call(deleteGroup, { params: { id: "3" } });
    expect(service.remove).toHaveBeenCalledWith(7, [3]);
    expect(one.res.status).toHaveBeenCalledWith(StatusCodes.NO_CONTENT);

    await call(deleteGroups, { query: { id: ["3", "4"] } });
    expect(service.remove).toHaveBeenLastCalledWith(7, [3, 4]);
    await call(deleteGroups, { query: { id: "5" } });
    expect(service.remove).toHaveBeenLastCalledWith(7, [5]);
  });

  it("send bad ids and service errors to the error handler", async () => {
    const bad = await call(deleteGroup, { params: { id: "1 or 1=1" } });
    expect(bad.next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(service.remove).not.toHaveBeenCalled();

    const failure = new Error("db down");
    service.list.mockRejectedValue(failure);
    const failed = await call(getStockGroups, {});
    expect(failed.next).toHaveBeenCalledWith(failure);
  });

  it("refuse a request with no user", async () => {
    const { next } = await call(getStockGroups, { headers: {} });
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error400);
    expect(service.list).not.toHaveBeenCalled();
  });
});
