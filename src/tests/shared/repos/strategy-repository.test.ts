import StrategyRepository from "../../../shared/services/repos/strategy-repository";
import { DatabaseAPI } from "../../../shared/services/db-api";
import { IStrategyEntity } from "../../../types/entity-types";

jest.mock("../../../shared/services/db-api");

describe("StrategyRepository", () => {
  describe("runQuery", () => {
    it("should run a query and return the result", async () => {
      const mockQuery = "SELECT * FROM strategies";
      const mockData: IStrategyEntity[] = [
        {
          id: 1,
          name: "Strategy 1",
          screeners: JSON.stringify(["screener1", "screener2"]),
          description: "",
          date_added: 0,
          period: 0,
          user_id: 0,
        },
        {
          id: 2,
          name: "Strategy 2",
          screeners: JSON.stringify(["screener3", "screener4"]),
          description: "",
          date_added: 0,
          period: 0,
          user_id: 0,
        },
      ];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result =
        await StrategyRepository["runQuery"]<IStrategyEntity>(mockQuery);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(mockQuery);
      //expect(result).toEqual(mockData.map(piece => ({ ...piece, screeners: JSON.parse(piece.screeners ?? '') })));
      expect(result).toEqual(mockData);
    });

    it("should throw an error if the query fails", async () => {
      const mockQuery = "SELECT * FROM strategies";
      const mockError = new Error("Query failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(
        StrategyRepository["runQuery"]<IStrategyEntity>(mockQuery),
      ).rejects.toThrow(mockError);
    });
  });

  // Add tests for other public methods in StrategyRepository
});
