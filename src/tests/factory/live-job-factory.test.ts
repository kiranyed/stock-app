import { LiveJobFactory } from "../../factory/live-job-factory";
import { RealMoneyStrategy } from "../../real-time-trading/real-money-strategy";
import { StrategySimulation } from "../../real-time-trading/strategy-simulation";
import { IStrategy } from "../../types/strategy-types";
import { ScreenerJobType, StrategyType } from "../../shared/constants";

jest.mock("../../real-time-trading/real-money-strategy");
jest.mock("../../real-time-trading/strategy-simulation");

describe("LiveJobFactory", () => {
  let strategy: IStrategy;

  beforeEach(() => {
    strategy = {} as IStrategy;
  });

  it("should create a RealMoneyStrategy instance when type is STRATEGY and strategyType is REAL", () => {
    const result = LiveJobFactory.createLiveJobInstance(
      ScreenerJobType.STRATEGY,
      strategy,
      StrategyType.REAL,
    );
    expect(result).toBeInstanceOf(RealMoneyStrategy);
    expect(RealMoneyStrategy).toHaveBeenCalledWith(strategy);
  });

  it("should create a StrategySimulation instance when type is STRATEGY and strategyType is not REAL", () => {
    const result = LiveJobFactory.createLiveJobInstance(
      ScreenerJobType.STRATEGY,
      strategy,
      StrategyType.SIMULATION,
    );
    expect(result).toBeInstanceOf(StrategySimulation);
    expect(StrategySimulation).toHaveBeenCalledWith(strategy);
  });

  it("should pass simulation options when provided", () => {
    const simulationOptions = { notifyOnEntry: true };
    const result = LiveJobFactory.createLiveJobInstance(
      ScreenerJobType.STRATEGY,
      strategy,
      StrategyType.SIMULATION,
      simulationOptions,
    );
    expect(result).toBeInstanceOf(StrategySimulation);
    expect(StrategySimulation).toHaveBeenCalledWith(strategy, simulationOptions);
  });
});
