import Error404 from "../../errors/error-404";
import { BackTestPool } from "../../run/back-test-pool";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { VariableCheckService } from "../../shared/services/variable-check-service";

jest.mock("../../shared/services/repos/stock-group-repository");
jest.mock("../../run/back-test-pool");

const groups = StockGroupRepository as jest.Mocked<typeof StockGroupRepository>;
const pool = BackTestPool as jest.Mocked<typeof BackTestPool>;
const variables = [{ varName: "percentchange", timeAgo: "10" }];

beforeEach(() => jest.clearAllMocks());

describe("VariableCheckService.getVariableValuesForGroup", () => {
  it("runs on the user's own group", async () => {
    groups.getOwnedGroup.mockResolvedValue([{ id: 3, name: "G", symbols: ["A"], user_id: 7 }] as never);
    pool.run.mockResolvedValue({ results: [[]], runtimeMs: 1 } as never);
    const response = await VariableCheckService.getVariableValuesForGroup(7, 3, variables as never, 1, 2);
    expect(groups.getOwnedGroup).toHaveBeenCalledWith(3, 7);
    expect(pool.run).toHaveBeenCalledWith(7, {
      kind: "variables",
      variables: [expect.objectContaining({ varName: "percentchange", timeAgo: "10" })],
      group: { id: 3, name: "G", symbols: ["A"] },
      config: expect.objectContaining({ startTime: 1, endTime: 2 }),
    });
    expect(response).toEqual({ variables: [expect.any(String)], rows: [] });
  });

  it("says 404 for a missing or someone else's group, without running anything", async () => {
    groups.getOwnedGroup.mockResolvedValue([]);
    await expect(VariableCheckService.getVariableValuesForGroup(8, 3, variables as never)).rejects.toThrow(
      new Error404("stock group not found"),
    );
    expect(pool.run).not.toHaveBeenCalled();
  });
});
