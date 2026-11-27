import Error400 from "../../errors/error-400";
import Error404 from "../../errors/error-404";
import Error409 from "../../errors/error-409";
import { GroupService, parseSymbols } from "../../services/group-service";
import { parseId } from "../../services/parse";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";

jest.mock("../../shared/services/repos/stock-group-repository");

const repo = StockGroupRepository as jest.Mocked<typeof StockGroupRepository>;
const row = (id: number, symbols: unknown) =>
  ({ id, name: `G${id}`, symbols, user_id: 7 }) as never;

beforeEach(() => jest.clearAllMocks());

describe("GroupService", () => {
  it("lists the user's groups, reading every way symbols have been stored", async () => {
    repo.getAllStockGroups.mockResolvedValue([row(1, '["AAPL","MSFT"]'), row(2, ["TSLA"]), row(3, "NVDA"), row(4, "")]);
    await expect(GroupService.list(7)).resolves.toEqual([
      { id: 1, name: "G1", symbols: ["AAPL", "MSFT"] },
      { id: 2, name: "G2", symbols: ["TSLA"] },
      { id: 3, name: "G3", symbols: ["NVDA"] },
      { id: 4, name: "G4", symbols: [] },
    ]);
    expect(repo.getAllStockGroups).toHaveBeenCalledWith(7);
  });

  it("creates a group with cleaned-up symbols", async () => {
    repo.createGroup.mockResolvedValue(12);
    await expect(GroupService.create(7, { name: "Big Tech", symbols: [" AAPL\r\n", "MSFT", " "] })).resolves.toEqual({
      id: 12,
      name: "Big Tech",
      symbols: ["AAPL", "MSFT"],
    });
    expect(repo.createGroup).toHaveBeenCalledWith("Big Tech", ["AAPL", "MSFT"], 7);
  });

  it.each([
    [{ name: "bad;name", symbols: [] }, /alphanumeric/],
    [{ name: 5, symbols: [] }, /alphanumeric/],
    [{ name: "ok", symbols: "AAPL" }, /array/],
    [{ name: "ok", symbols: ["AAPL", 3] }, /string/],
  ])("rejects bad input %j", async (input, message) => {
    await expect(GroupService.create(7, input)).rejects.toThrow(message);
    await expect(GroupService.create(7, input)).rejects.toBeInstanceOf(Error400);
    expect(repo.createGroup).not.toHaveBeenCalled();
  });

  it("updates only the user's own group, and says 404 otherwise", async () => {
    repo.updateGroup.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(GroupService.update(7, 3, { name: "New", symbols: ["A"] })).resolves.toEqual({
      id: 3,
      name: "New",
      symbols: ["A"],
    });
    expect(repo.updateGroup).toHaveBeenCalledWith(3, 7, "New", ["A"]);
    await expect(GroupService.update(7, 4, { name: "New", symbols: ["A"] })).rejects.toBeInstanceOf(Error404);
  });

  it("gets a group only for its owner", async () => {
    repo.getOwnedGroup.mockResolvedValueOnce([row(3, '["A"]')]).mockResolvedValueOnce([]);
    await expect(GroupService.get(7, 3)).resolves.toEqual({ id: 3, name: "G3", symbols: ["A"] });
    await expect(GroupService.get(7, 4)).rejects.toBeInstanceOf(Error404);
  });

  it("refuses (409) to delete a group with runs or saved back tests, says why, and deletes none", async () => {
    repo.getOwnedIds.mockResolvedValueOnce([3, 4]);
    repo.getHistoryCounts.mockResolvedValueOnce([
      { id: 3, name: "Tech", runs: 1, backtests: 0 },
      { id: 4, name: "Other", runs: 0, backtests: 0 },
    ]);
    const err = await GroupService.remove(7, [3, 4]).catch((e) => e);
    expect(err).toBeInstanceOf(Error409);
    expect(err.message).toBe(
      'Can\'t delete: "Tech" has 1 run. ' +
        "Run history and back-test results are kept, so a group that has any can't be deleted. Nothing was deleted.",
    );
    expect(repo.deleteGroups).not.toHaveBeenCalled();

    repo.getOwnedIds.mockResolvedValueOnce([4]);
    repo.getHistoryCounts.mockResolvedValueOnce([{ id: 4, name: "Other", runs: 0, backtests: 0 }]);
    repo.deleteGroups.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "ER_ROW_IS_REFERENCED_2" }));
    await expect(GroupService.remove(7, [4])).rejects.toThrow(/group now has run history/);
  });

  it("deletes all requested groups or none", async () => {
    repo.getOwnedIds.mockResolvedValueOnce([3, 4]);
    repo.getHistoryCounts.mockResolvedValueOnce([]);
    await GroupService.remove(7, [3, 4, 3]);
    expect(repo.getHistoryCounts).toHaveBeenCalledWith([3, 4], 7);
    expect(repo.deleteGroups).toHaveBeenCalledWith([3, 4], 7);

    repo.deleteGroups.mockClear();
    repo.getOwnedIds.mockResolvedValueOnce([3]);
    await expect(GroupService.remove(7, [3, 99])).rejects.toBeInstanceOf(Error404);
    expect(repo.deleteGroups).not.toHaveBeenCalled();

    await expect(GroupService.remove(7, [])).rejects.toBeInstanceOf(Error400);
  });
});

describe("parseId and parseSymbols", () => {
  it("accepts positive integers only", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId(5)).toBe(5);
    for (const bad of ["0", "-1", "1.5", "1 or 1=1", "", undefined, null]) {
      expect(() => parseId(bad)).toThrow(Error400);
    }
  });

  it("keeps a bare string that isn't JSON", () => {
    expect(parseSymbols("[not json")).toEqual(["[not json"]);
    expect(parseSymbols(undefined)).toEqual([]);
  });
});
