import { Period } from "../../shared/constants";
import StrategyMapper from "../../mappers/strategy-mapper";
import { IStrategyEntity } from "../../types/entity-types";
import { IScreener } from "../../types/strategy-types";
export const defaultScreener: IScreener = {
  buySellFilters: {
    enter: {
      filters: [],
      connectors: [],
    },
    exit: {
      filters: [],
      connectors: [],
    },
  },
};
describe("StrategyMapper", () => {
  describe("parseScreeners", () => {
    it("should parse a valid JSON string into an array of IScreener", () => {
      const screeners: IScreener[] = [defaultScreener];
      const jsonString = JSON.stringify(screeners);

      const result = StrategyMapper.parseScreeners(jsonString);

      expect(result).toEqual(screeners);
    });

    it("should throw an error for invalid JSON", () => {
      const invalidJsonString = "{ invalid json }";

      expect(() => {
        StrategyMapper.parseScreeners(invalidJsonString);
      }).toThrow();
    });
  });

  describe("stringifyScreeners", () => {
    it("should stringify an array of IScreener into a JSON string", () => {
      const screeners: IScreener[] = [defaultScreener];

      const result = StrategyMapper.stringifyScreeners(screeners);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(screeners);
    });
  });

  describe("convertEntityToStrategy", () => {
    it("should convert an IStrategyEntity to an IStrategy", () => {
      const mockEntity: IStrategyEntity = {
        id: 1,
        name: "Test Strategy",
        screeners: JSON.stringify([defaultScreener]),
        description: "Sample description",
        period: Period.ONE_DAY,
        user_id: 1,
        date_added: Date.now(),
      };

      const strategy = StrategyMapper.convertEntityToStrategy(mockEntity);

      expect(strategy).toEqual({
        id: mockEntity.id,
        name: mockEntity.name,
        screeners: [defaultScreener],
        description: mockEntity.description,
        period: mockEntity.period,
      });
    });
  });
});
