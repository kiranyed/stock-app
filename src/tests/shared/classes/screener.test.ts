import { Screener } from "../../../shared/classes/screener";
import { FilterGroup } from "../../../shared/classes/filter-group";
import {
  IScreener,
  IFilterGroupPair,
  IFilter as OriginalIFilter,
} from "../../../types/strategy-types";
import * as filterVariableResolver from "../../../shared/utilities/filter-variable-resolver";

// Extend IFilter for test purposes to allow extra properties
type IFilter = OriginalIFilter & {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  periodsBefore?: number;
  periodsAfter?: number;
  emaPeriod1?: number;
  emaPeriod2?: number;
  percentile?: number;
  timeAgo?: string;
  compareVar?: string;
  compareTimeAgo?: string;
  bullish?: boolean;
  vwapPeriod?: number;
  crossoverLevel?: number;
  period?: number;
};

jest.mock("../../../shared/classes/filter-group");
jest.mock("../../../shared/utilities/strategy-util");
jest.mock("../../../shared/utilities/stock-trade");
jest.mock("../../../shared/utilities/filter-variable-resolver");

describe("Screener", () => {
  let screener: Screener;
  let mockScreener: IScreener;
  let mockBuySellFilters: IFilterGroupPair;
  let mockShortCoverFilters: IFilterGroupPair;
  let mockFilterGroupInstance: jest.Mocked<FilterGroup>;

  beforeEach(() => {
    mockBuySellFilters = {
      enter: {
        filters: [{ varName: "test", operator: "<", compareVal: "3" }],
        connectors: [],
      },
      exit: { filters: [], connectors: [] },
    };

    mockShortCoverFilters = {
      enter: { filters: [], connectors: [] },
      exit: { filters: [], connectors: [] },
    };

    mockScreener = {
      buySellFilters: mockBuySellFilters,
      shortCoverFilters: mockShortCoverFilters,
    };

    // ✅ Create a properly mocked FilterGroup instance
    mockFilterGroupInstance = {
      filters: [{ varName: "test", operator: "<", compareVal: "3" }],
      connectors: [],
      getFilters: jest
        .fn()
        .mockReturnValue([{ varName: "test", operator: "<", compareVal: "3" }]),
      run: jest.fn(),
    } as unknown as jest.Mocked<FilterGroup>;
    // ✅ Ensure that the mocked FilterGroup constructor returns this mock instance
    (FilterGroup as jest.Mock).mockImplementation(
      () => mockFilterGroupInstance,
    );

    screener = new Screener(mockScreener);
  });

  describe("getAllVariables", () => {
    it("should call resolveFilterVariables for each filter and return all variables", () => {
      const mockFilters: IFilter[] = [
        { varName: "rsi", operator: ">", compareVal: "70" },
        {
          varName: "macd",
          operator: ">",
          compareVal: "0",
          fastPeriod: 12,
          slowPeriod: 26,
        },
        { varName: "priceEma", operator: ">", compareVal: "100", timeAgo: "5" },
      ];

      // Mock getAllFilters to return our test filters
      jest.spyOn(screener, "getAllFilters").mockReturnValue(mockFilters);

      // Mock resolveFilterVariables to return specific arrays for each filter
      const mockResolveFilterVariables = jest
        .spyOn(filterVariableResolver, "resolveFilterVariables")
        .mockImplementation((filter: IFilter) => {
          if (filter.varName === "rsi") return ["rsi14"];
          if (filter.varName === "macd")
            return ["priceEma12", "priceEma26", "macdFast12Slow26"];
          if (filter.varName === "priceEma") return ["priceEma5"];
          return [];
        });

      const variables = screener.getAllVariables();

      // Verify resolveFilterVariables was called for each filter
      expect(mockResolveFilterVariables).toHaveBeenCalledTimes(3);
      expect(mockResolveFilterVariables).toHaveBeenCalledWith(mockFilters[0]);
      expect(mockResolveFilterVariables).toHaveBeenCalledWith(mockFilters[1]);
      expect(mockResolveFilterVariables).toHaveBeenCalledWith(mockFilters[2]);

      // Verify the returned variables are collected from all filters
      expect(variables).toEqual([
        "rsi14",
        "priceEma12",
        "priceEma26",
        "macdFast12Slow26",
        "priceEma5",
      ]);
    });

    it("should handle empty filter list", () => {
      jest.spyOn(screener, "getAllFilters").mockReturnValue([]);

      const variables = screener.getAllVariables();

      expect(variables).toEqual([]);
    });
  });

  describe("getAllFilters", () => {
    it("should return all filters", () => {
      const result = screener.getAllFilters();
      const arr = new Array(4).fill({
        varName: "test",
        operator: "<",
        compareVal: "3",
      });
      expect(result).toEqual(arr);
    });
  });
});
