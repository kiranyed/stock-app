import StockGroupMapper from "../../mappers/stock-group-mapper";
import { IStockGroup, IStockGroupEntity } from "../../types/entity-types";

describe("StockGroupMapper", () => {
  describe("convertGroupToEntity", () => {
    it("should convert an IStockGroup to an IStockGroupEntity", () => {
      const group: IStockGroup = {
        id: 1,
        name: "Test Group",
        symbols: ["AAPL", "GOOGL"],
      };
      const userId = 1;

      const expectedEntity: IStockGroupEntity = {
        id: 1,
        name: "Test Group",
        symbols: "AAPL,GOOGL",
        user_id: userId,
      };

      const result = StockGroupMapper.convertGroupToEntity(group, userId);

      expect(result).toEqual(expectedEntity);
    });
  });
});
