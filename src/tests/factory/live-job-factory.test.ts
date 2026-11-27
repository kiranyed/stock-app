import { LiveJobFactory } from "../../factory/live-job-factory";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";
import { IStrategy } from "../../types/strategy-types";
import { ScreenerJobType } from "../../shared/constants";

jest.mock("../../real-time-trading/strategy-simulation");

describe("LiveJobFactory", () => {
  let strategy: IStrategy;

  beforeEach(() => {
    strategy = {} as IStrategy;
  });

  it("creates a StrategySimulation instance for strategy runs", () => {
    const result = LiveJobFactory.createLiveJobInstance(
      ScreenerJobType.STRATEGY,
      strategy,
    );
    expect(result).toBeInstanceOf(StrategySimulation);
    expect(StrategySimulation).toHaveBeenCalledWith(strategy);
  });

  it("should pass simulation options when provided", () => {
    const simulationOptions = { notifyOnEntry: true };
    const result = LiveJobFactory.createLiveJobInstance(
      ScreenerJobType.STRATEGY,
      strategy,
      simulationOptions,
    );
    expect(result).toBeInstanceOf(StrategySimulation);
    expect(StrategySimulation).toHaveBeenCalledWith(strategy, simulationOptions);
  });
});
