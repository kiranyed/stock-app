import Error404 from "../../errors/error-404";
import { ScreenerJobService } from "../../shared/services/screener-job-service";
import StrategyRepository from "../../shared/services/repos/strategy-repository";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";

jest.mock("../../shared/services/repos/strategy-repository");
jest.mock("../../shared/services/repos/stock-group-repository");

const strategies = StrategyRepository as jest.Mocked<typeof StrategyRepository>;
const groups = StockGroupRepository as jest.Mocked<typeof StockGroupRepository>;
const strategy = (id: number) =>
  ({ id, name: `S${id}`, description: "", period: 1440, screeners: "[]", user_id: 7 }) as never;
const group = { id: 3, name: "G", symbols: '["A"]', user_id: 7 } as never;

beforeEach(() => jest.clearAllMocks());

describe("ScreenerJobService.setUpStrategies", () => {
  it("loads the user's strategies in the order asked, and the user's group", async () => {
    strategies.getOwnedStrategies.mockResolvedValue([strategy(6), strategy(4)]);
    groups.getOwnedGroup.mockResolvedValue([group]);
    const { strategies: loaded, group: g } = await ScreenerJobService.setUpStrategies(7, [4, 6, 4], 3);
    expect(loaded.map((s) => s.id)).toEqual([4, 6]);
    expect(g).toMatchObject({ id: 3, symbols: ["A"] });
    expect(strategies.getOwnedStrategies).toHaveBeenCalledWith([4, 6], 7);
    expect(groups.getOwnedGroup).toHaveBeenCalledWith(3, 7);
  });

  it("says 404 when any strategy is missing or someone else's", async () => {
    strategies.getOwnedStrategies.mockResolvedValue([strategy(4)]);
    groups.getOwnedGroup.mockResolvedValue([group]);
    await expect(ScreenerJobService.setUpStrategies(7, [4, 99], 3)).rejects.toThrow(new Error404("strategy not found"));
    await expect(ScreenerJobService.setUpStrategies(7, [], 3)).rejects.toBeInstanceOf(Error404);
  });

  it("says 404 when the group is missing or someone else's", async () => {
    strategies.getOwnedStrategies.mockResolvedValue([strategy(4)]);
    groups.getOwnedGroup.mockResolvedValue([]);
    await expect(ScreenerJobService.setUpStrategies(7, [4], 3)).rejects.toThrow("stock group not found");
  });
});

describe("ScreenerJobService.getOwnedGroup", () => {
  it("returns the user's own group", async () => {
    groups.getOwnedGroup.mockResolvedValue([group]);
    await expect(ScreenerJobService.getOwnedGroup(7, 3)).resolves.toMatchObject({ id: 3, symbols: ["A"] });
    expect(groups.getOwnedGroup).toHaveBeenCalledWith(3, 7);
  });

  it("says 404 when the group is missing or someone else's", async () => {
    groups.getOwnedGroup.mockResolvedValue([]);
    await expect(ScreenerJobService.getOwnedGroup(8, 3)).rejects.toThrow(
      new Error404("stock group not found"),
    );
  });
});
