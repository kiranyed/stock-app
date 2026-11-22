import StockGroupMapper from "../../mappers/stock-group-mapper";
import { IStockGroup, IStockGroupEntity } from "../../types/entity-types";

describe("StockGroupMapper", () => {
  describe("parseSymbols", () => {
    it("should return symbols when input is already an array", () => {
      const symbols = ["AAPL", "MSFT"];

      const result = StockGroupMapper.parseSymbols(symbols);

      expect(result).toEqual(symbols);
    });

    it("should parse a JSON string array of symbols", () => {
      const result = StockGroupMapper.parseSymbols('["AAPL", "MSFT", "NVDA"]');

      expect(result).toEqual(["AAPL", "MSFT", "NVDA"]);
    });

    it("should parse comma-separated symbols with trimming", () => {
      const result = StockGroupMapper.parseSymbols(" AAPL,  MSFT ,NVDA , ");

      expect(result).toEqual(["AAPL", "MSFT", "NVDA"]);
    });

    it("should return an empty array for empty string input", () => {
      const result = StockGroupMapper.parseSymbols("   ");

      expect(result).toEqual([]);
    });

    it("should return an empty array when JSON value is not an array", () => {
      const result = StockGroupMapper.parseSymbols('{"symbol":"AAPL"}');

      expect(result).toEqual([]);
    });
  });

  describe("convertEntityToGroup", () => {
    it("should parse JSON symbols when converting an entity", () => {
      const entity: IStockGroupEntity = {
        id: 1,
        name: "JSON Group",
        symbols: '["AAPL","GOOGL"]',
        user_id: 7,
      };

      const result = StockGroupMapper.convertEntityToGroup(entity);

      expect(result).toEqual({
        id: 1,
        name: "JSON Group",
        symbols: ["AAPL", "GOOGL"],
      });
    });

    it("should parse comma-separated symbols when converting an entity", () => {
      const entity: IStockGroupEntity = {
        id: 2,
        name: "CSV Group",
        symbols: "AAPL, GOOGL, TSLA",
        user_id: 8,
      };

      const result = StockGroupMapper.convertEntityToGroup(entity);

      expect(result).toEqual({
        id: 2,
        name: "CSV Group",
        symbols: ["AAPL", "GOOGL", "TSLA"],
      });
    });
  });

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
