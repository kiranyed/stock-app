import Error400 from "../../errors/error-400";
import Error404 from "../../errors/error-404";
import Error409 from "../../errors/error-409";
import { StrategyService } from "../../services/strategy-service";
import { IStrategyInput, strategyPeriods, validateStrategyInput } from "../../services/strategy-validation";
import { PeriodType } from "../../shared/constants";
import StrategyRepository from "../../shared/services/repos/strategy-repository";

jest.mock("../../shared/services/repos/strategy-repository");

const repo = StrategyRepository as jest.Mocked<typeof StrategyRepository>;

const filter = (varName: string, operator: string) => ({ varName, timeAgo: "1", compareVal: "1", operator });
const valid = {
  period: 60,
  name: "test",
  description: "testdescription",
  screeners: [
    {
      buySellFilters: {
        enter: { filters: [filter("percentchange", ">")], connectors: ["AND"] },
        exit: { filters: [filter("percentchange", "<")], connectors: [] },
      },
    },
  ],
};

/** `valid` as saved: its screener gets a new id. */
const saved = { ...valid, screeners: [{ ...valid.screeners[0], id: expect.stringMatching(/^scr_[0-9a-f]{12}$/) }] };
/** `valid` with one screener's enter filters replaced. */
const enterFilters = (filters: object[], connectors = filters.slice(1).map(() => "AND")) => ({
  ...valid,
  screeners: [{ buySellFilters: { enter: { filters, connectors }, exit: { filters: [], connectors: [] } } }],
});

beforeEach(() => jest.clearAllMocks());

describe("validateStrategyInput", () => {
  it("accepts a valid strategy, keeps only the strategy's fields, and gives a new screener an id", () => {
    expect(validateStrategyInput({ ...valid, id: 99, user_id: 5 })).toEqual(saved);
  });

  it("keeps the ids of screeners sent back and accepts unused trailing connectors", () => {
    const kept = validateStrategyInput({ ...valid, screeners: [{ ...valid.screeners[0], id: "s1" }] });
    expect(kept.screeners[0].id).toBe("s1");

    const withTrailingConnectors = enterFilters(
      [filter("percentchange", ">"), filter("percentchange", "<")],
      ["AND", "OR"],
    );
    expect(() => validateStrategyInput(withTrailingConnectors)).not.toThrow();
  });

  it("carries an old id only to an identical screener when a client omits ids", () => {
    const unchanged = { ...valid.screeners[0], id: "unchanged" };
    const changed = {
      ...valid.screeners[0],
      buySellFilters: {
        ...valid.screeners[0].buySellFilters,
        enter: { filters: [filter("percentchange", ">"), { ...filter("percentchange", "<"), compareVal: "2" }], connectors: ["AND"] },
      },
    };
    const oldChanged = { ...valid.screeners[0], id: "old-changed" };
    const input = {
      ...valid,
      screeners: [valid.screeners[0], changed],
    };

    const result = validateStrategyInput(input, undefined, [unchanged, oldChanged]);

    expect(result.screeners[0].id).toBe("unchanged");
    expect(result.screeners[1].id).not.toBe("old-changed");
    expect(result.screeners[1].id).toMatch(/^scr_[0-9a-f]{12}$/);
  });

  it.each([
    ["not a strategy", { invalid: "strategy" }, "name: name is required"],
    ["a period that isn't a number", { ...valid, period: "60" }, "period: period must be a number of minutes"],
    ["a period the app doesn't have", { ...valid, period: 7 }, "period: period must be one of 1, 5, 10, 30, 60, 1440 (minutes)"],
    ["a name too long for its column", { ...valid, name: "x".repeat(51) }, "name: name is at most 50 characters"],
    ["no screeners", { ...valid, screeners: [] }, "screeners: a strategy needs at least one screener"],
    [
      "an unknown connector",
      enterFilters([], ["XOR"]),
      "screeners[0].buySellFilters.enter.connectors[0]: every connector must be AND or OR",
    ],
    [
      "too few connectors",
      enterFilters([filter("percentchange", ">"), filter("percentchange", ">"), filter("percentchange", ">")], ["AND"]),
      "screeners[0].buySellFilters.enter.connectors: 3 filters need 2 connectors (AND or OR between each pair), got 1",
    ],
    [
      "more connectors than any group can use",
      enterFilters([filter("percentchange", ">")], Array(51).fill("AND")),
      "screeners[0].buySellFilters.enter.connectors: at most 50 connectors",
    ],
    [
      "an unknown operator",
      enterFilters([filter("percentchange", "=>")]),
      "screeners[0].buySellFilters.enter.filters[0].operator: operator must be one of = != > >= < <=",
    ],
    [
      "a compareVal that isn't a number, with no compare variable",
      enterFilters([{ ...filter("percentchange", ">"), compareVal: "high" }]),
      "screeners[0].buySellFilters.enter.filters[0].compareVal: compareVal must be a number unless compareVar is set",
    ],
    [
      "a variable the engine can't compute, at save rather than when a run loads it",
      enterFilters([{ varName: "adx", operator: ">", compareVal: "20" }]),
      'screeners[0].buySellFilters.enter.filters[0]: Unsupported variable "adx"',
    ],
    [
      "a filter missing a param its variable needs",
      enterFilters([{ varName: "macd", operator: ">", compareVal: "0", fastPeriod: "12" }]),
      "screeners[0].buySellFilters.enter.filters[0]: macd: missing slowPeriod",
    ],
    [
      "two screeners with the same id",
      { ...valid, screeners: [{ ...valid.screeners[0], id: "a" }, { ...valid.screeners[0], id: "a" }] },
      'two screeners have the id "a"',
    ],
  ])("rejects %s, saying where", (_, input, message) => {
    expect(() => validateStrategyInput(input)).toThrow(new Error400(message));
  });
});

describe("strategies and the market data provider's periods", () => {
  const endOfDay = {
    name: "eod",
    capabilities: { periods: [PeriodType.DAY], realTime: false, displayPrices: false },
  };
  const withFilters = (period: number, ...filters: object[]) =>
    ({
      ...valid,
      period,
      screeners: [
        {
          buySellFilters: {
            enter: { filters, connectors: filters.slice(1).map(() => "AND") },
            exit: { filters: [filter("percentchange", "<")], connectors: [] },
          },
        },
      ],
    }) as unknown as IStrategyInput;
  // a VWAP filter's timeAgo is the period of the bars it averages
  const vwap = (barPeriod: string) => ({ varName: "vwap", operator: ">", compareVal: "0", timeAgo: barPeriod });
  const mtsi = (vwapPeriod: string) => ({
    varName: "mtsi",
    operator: ">",
    compareVal: "0",
    emaPeriod1: "5",
    emaPeriod2: "10",
    vwapPeriod,
  });

  it("an end-of-day provider rejects an intraday strategy, saying which periods it serves", () => {
    expect(() => validateStrategyInput(withFilters(30, filter("percentchange", ">")), endOfDay)).toThrow(
      new Error400(
        "The eod market data provider doesn't serve 30-minute bars, which this strategy uses. Periods it serves: daily.",
      ),
    );
    expect(validateStrategyInput(withFilters(PeriodType.DAY, filter("percentchange", ">")), endOfDay).period).toBe(
      PeriodType.DAY,
    );
  });

  it("counts the periods of VWAP and MTSI's VWAP, not only the strategy's own", () => {
    expect(() => validateStrategyInput(withFilters(PeriodType.DAY, vwap("5")), endOfDay)).toThrow(/serve 5-minute bars/);
    expect(() => validateStrategyInput(withFilters(PeriodType.DAY, mtsi("1")), endOfDay)).toThrow(/serve 1-minute bars/);
    expect(
      strategyPeriods(withFilters(PeriodType.THIRTY_MINUTES, vwap("5"), mtsi("1"), filter("percentchange", ">"))).sort(
        (a, b) => a - b,
      ),
    ).toEqual([1, 5, 30]);
  });

  it("rejects a period no provider serves, and says when a provider serves none", () => {
    const empty = { name: "recorded", capabilities: { ...endOfDay.capabilities, periods: [] } };
    expect(() => validateStrategyInput(withFilters(PeriodType.DAY, filter("percentchange", ">")), empty)).toThrow(
      /doesn't serve daily bars.*Periods it serves: none\./,
    );
    expect(() => validateStrategyInput(withFilters(PeriodType.FIVE_MINUTES, filter("percentchange", ">")), endOfDay)).toThrow(
      /doesn't serve 5-minute bars/,
    );
  });

  it("strategyPeriods skips a filter the engine can't compute (validation rejects it first)", () => {
    const adx = { varName: "adx", operator: ">", compareVal: "20" };
    expect(strategyPeriods(withFilters(PeriodType.DAY, adx))).toEqual([PeriodType.DAY]);
  });

  it("uses the configured provider by default (Schwab and Massive serve every period)", () => {
    expect(validateStrategyInput(withFilters(PeriodType.MINUTE, vwap("1"))).period).toBe(PeriodType.MINUTE);
  });
});

describe("StrategyService", () => {
  it("creates a validated strategy for the user", async () => {
    repo.createStrategy.mockResolvedValue({ insertId: 5 });
    await expect(StrategyService.create(7, { ...valid, id: 1 })).resolves.toEqual({ id: 5 });
    expect(repo.createStrategy).toHaveBeenCalledWith([saved], 7);
  });

  it("refuses an invalid strategy without saving", async () => {
    await expect(StrategyService.create(7, { name: "x" })).rejects.toBeInstanceOf(Error400);
    expect(repo.createStrategy).not.toHaveBeenCalled();
  });

  it("updates only the user's own strategy", async () => {
    const stored = { ...valid.screeners[0], id: "old-screener-id" };
    repo.getOwnedStrategies.mockResolvedValueOnce([
      { id: 3, name: "test", description: "testdescription", period: 60, screeners: JSON.stringify([stored]), user_id: 7 },
    ] as never);
    repo.updateStrategy.mockResolvedValueOnce(1);
    await expect(StrategyService.update(7, 3, valid)).resolves.toEqual({
      id: 3,
      ...valid,
      screeners: [stored],
    });
    expect(repo.getOwnedStrategies).toHaveBeenCalledWith([3], 7);
    expect(repo.updateStrategy).toHaveBeenCalledWith(3, 7, { ...valid, screeners: [stored] });

    repo.getOwnedStrategies.mockResolvedValueOnce([]);
    await expect(StrategyService.update(7, 4, valid)).rejects.toBeInstanceOf(Error404);
    expect(repo.updateStrategy).toHaveBeenCalledTimes(1);
  });

  it("lists strategies, parsing stored screeners and giving version-1 ones their ids", async () => {
    repo.getAllStrategies.mockResolvedValue([
      { id: 1, name: "a", description: "", period: 30, screeners: JSON.stringify(valid.screeners), user_id: 7 },
    ] as never);
    await expect(StrategyService.list(7)).resolves.toEqual([
      { id: 1, name: "a", description: "", period: 30, screeners: [{ ...valid.screeners[0], id: "s1" }] },
    ]);
  });

  it("finds by name for the caller, not a fixed user", async () => {
    repo.getByName.mockResolvedValue([]);
    await StrategyService.getByNames(7, ["a"]);
    expect(repo.getByName).toHaveBeenCalledWith(["a"], 7);
  });

  it("deletes all requested strategies or none", async () => {
    repo.getOwnedIds.mockResolvedValueOnce([3, 4]);
    repo.getHistoryCounts.mockResolvedValueOnce([
      { id: 3, name: "a", runs: 0, backtests: 0 },
      { id: 4, name: "b", runs: 0, backtests: 0 },
    ]);
    await StrategyService.remove(7, [3, 4]);
    expect(repo.getHistoryCounts).toHaveBeenCalledWith([3, 4], 7);
    expect(repo.deleteStrategies).toHaveBeenCalledWith([3, 4], 7);

    repo.deleteStrategies.mockClear();
    repo.getOwnedIds.mockResolvedValueOnce([3]);
    await expect(StrategyService.remove(7, [3, 99])).rejects.toBeInstanceOf(Error404);
    expect(repo.deleteStrategies).not.toHaveBeenCalled();
  });

  it("refuses (409) to delete strategies with runs or saved back tests, says which, and deletes none", async () => {
    repo.getOwnedIds.mockResolvedValueOnce([3, 4, 5]);
    repo.getHistoryCounts.mockResolvedValueOnce([
      { id: 3, name: "Gap up", runs: 2, backtests: 1 },
      { id: 4, name: "Clean", runs: 0, backtests: 0 },
      { id: 5, name: "Dip", runs: 0, backtests: 3 },
    ]);
    const err = await StrategyService.remove(7, [3, 4, 5]).catch((e) => e);
    expect(err).toBeInstanceOf(Error409);
    expect(err.message).toBe(
      'Can\'t delete: "Gap up" has 2 runs and 1 saved back-test result; "Dip" has 3 saved back-test results. ' +
        "Run history and back-test results are kept, so a strategy that has any can't be deleted. Nothing was deleted.",
    );
    expect(repo.deleteStrategies).not.toHaveBeenCalled();
  });

  it("answers 409 when history appears between the check and the delete, and passes other errors on", async () => {
    repo.getOwnedIds.mockResolvedValue([3]);
    repo.getHistoryCounts.mockResolvedValue([{ id: 3, name: "a", runs: 0, backtests: 0 }]);
    repo.deleteStrategies.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "ER_ROW_IS_REFERENCED_2" }));
    await expect(StrategyService.remove(7, [3])).rejects.toThrow(/strategy now has run history/);

    const other = new Error("db down");
    repo.deleteStrategies.mockRejectedValueOnce(other);
    await expect(StrategyService.remove(7, [3])).rejects.toBe(other);
  });
});
