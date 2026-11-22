import { PeriodType, ScreenerJobType } from "../../shared/constants";
import { BackTest } from "../../back-testing/back-test";
import { BackTestFactory } from "../../factory/back-test-factory";
import { IStrategy } from "../../types/strategy-types";

jest.mock("../../back-testing/back-test");

describe("BackTestFactory", () => {
  describe("createBackTestInstance", () => {
    it("should create an instance of BackTest when type is STRATEGY", () => {
      const type: ScreenerJobType = ScreenerJobType.STRATEGY;
      const strategy: IStrategy = {
        id: 1,
        name: "Test Strategy",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      };

      const backTestInstance = BackTestFactory.createBackTestInstance(
        type,
        strategy,
      );

      expect(BackTest).toHaveBeenCalledWith(strategy);
      expect(backTestInstance).toBeInstanceOf(BackTest);
    });

    it("should throw an error when type is invalid", () => {
      const type: ScreenerJobType =
        "INVALID_TYPE" as unknown as ScreenerJobType;
      const strategy: IStrategy = {
        id: 1,
        name: "Test Strategy",
        screeners: [],
        description: "",
        period: PeriodType.MINUTE,
      };

      expect(() => {
        BackTestFactory.createBackTestInstance(type, strategy);
      }).toThrow("Invalid job type in createBackTestInstance");
    });
  });
});
