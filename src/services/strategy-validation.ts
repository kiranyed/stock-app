import Error400 from "../errors/error-400";
import { IFilter, IScreener, IStrategy } from "../types/strategy-types";
import { isFilter, validatePercentileSessionLimit } from "../middleware/shared-funcs";
import { PeriodType } from "../shared/constants";
import { filterVariables } from "../engine/filter-specs";
import { homePeriod, InvalidSpecError } from "../engine/specs";
import { assignScreenerIds, carryOverIds, parseStrategyInput } from "./strategy-schema";
import { MarketDataProvider, periodLabel } from "../providers/market-data-provider";
import { marketData } from "../providers/market-data";

/** What a caller sends to create or change a strategy, once checked. */
export type IStrategyInput = Pick<IStrategy, "name" | "description" | "period" | "screeners">;

type DataSource = Pick<MarketDataProvider, "name" | "capabilities">;

/**
 * Checks a strategy before it's saved, and returns it ready to store; throws Error400 naming the
 * first problem and where it is:
 * 1. its shape, against the versioned schema (strategy-schema.ts);
 * 2. every filter, with the engine's own parser (filter-specs.ts), so a filter that couldn't run
 *    (an unsupported variable, a missing or bad param) fails now, not when a back test or live
 *    run loads it; and a percentile filter's sessions against the period's cap;
 * 3. screener ids: kept for screeners sent back; a screener sent without one reuses the id of an
 *    identical screener in `stored` (the strategy being updated), else gets a new one;
 * 4. that the market data provider serves every bar period it uses.
 *
 * The engine's parser is the authority on variables and params; the older per-filter checker
 * (shared-funcs validateFilter) has its own out-of-date variable list and isn't used here.
 */
export function validateStrategyInput(
  payload: unknown,
  provider: DataSource = marketData(),
  stored: IScreener[] = [],
): IStrategyInput {
  const parsed = parseStrategyInput(payload);
  const { name, description, period } = parsed;
  const screeners = parsed.screeners as IScreener[];
  screeners.forEach((screener, i) => {
    for (const side of ["buySellFilters", "shortCoverFilters"] as const) {
      for (const which of ["enter", "exit"] as const) {
        screener[side]?.[which].filters.forEach((filter, j) => {
          const where = `screeners[${i}].${side}.${which}.filters[${j}]`;
          try {
            for (const { spec } of filterVariables(filter, period)) {
              if (spec?.kind === "percentChangePercentile") validatePercentileSessionLimit(period, spec.sessions);
            }
          } catch (err) {
            if (err instanceof Error400 || err instanceof InvalidSpecError) throw new Error400(`${where}: ${err.message}`);
            throw err;
          }
        });
      }
    }
  });
  const strategy: IStrategyInput = {
    name,
    description,
    period,
    screeners: assignScreenerIds(carryOverIds(screeners, stored)),
  };
  checkProviderServes(strategy, provider);
  return strategy;
}

/** Throws Error400 if the strategy uses a bar period the provider doesn't serve. */
export function checkProviderServes(strategy: IStrategyInput, { name, capabilities }: DataSource) {
  const missing = strategyPeriods(strategy).filter((p) => !capabilities.periods.includes(p));
  if (!missing.length) return;
  const served = capabilities.periods.length ? capabilities.periods.map(periodLabel).join(", ") : "none";
  throw new Error400(
    `The ${name} market data provider doesn't serve ${missing.map(periodLabel).join(" or ")} bars, ` +
      `which this strategy uses. Periods it serves: ${served}.`,
  );
}

/**
 * The bar periods a strategy reads: its own, and those of any VWAP on another period (directly
 * or inside MTSI). A filter the engine can't compute is skipped here; that error comes when the
 * strategy loads, as before.
 */
export function strategyPeriods(strategy: IStrategyInput): PeriodType[] {
  const periods = new Set<PeriodType>([strategy.period]);
  // the shape checks above let some odd shapes through (a pair without connectors, say)
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);
  const pairs = list<IScreener | null>(strategy.screeners).flatMap((s) => [s?.buySellFilters, s?.shortCoverFilters]);
  const filters = pairs.flatMap((pair) => [...list<IFilter>(pair?.enter?.filters), ...list<IFilter>(pair?.exit?.filters)]);
  for (const filter of filters) {
    if (!isFilter(filter)) continue;
    let variables;
    try {
      variables = filterVariables(filter, strategy.period);
    } catch {
      continue;
    }
    for (const { spec } of variables) {
      if (!spec) continue;
      periods.add(homePeriod(spec, strategy.period));
      if (spec.kind === "mtsi") periods.add(spec.vwapPeriod);
    }
  }
  return [...periods];
}
