import {
  IFilter,
  IMACDFilter,
  IMTSIFilter,
  IMacdCrossOverFilter,
  IPercentileRankFilter,
  IMacdDivergenceFilter,
  IRsiDivergenceFilter,
  IRsiCrossoverFilter,
  IPricePercentChangePercentileFilter,
} from "../../types/strategy-types";
import { VariableBuilders } from "./variable-patterns";
import { StrategyUtil } from "./strategy-util";

/**
 * Type guards for different filter types
 */
export const FilterTypeGuards = {
  isMacdFilter: (filter: IFilter): filter is IMACDFilter => {
    return (
      filter.varName === "macd" &&
      "fastPeriod" in filter &&
      "slowPeriod" in filter
    );
  },

  isMacdCrossOverFilter: (filter: IFilter): filter is IMacdCrossOverFilter => {
    return (
      filter.varName === "macdCrossover" &&
      "fastPeriod" in filter &&
      "slowPeriod" in filter &&
      "signalPeriod" in filter &&
      "periodsBefore" in filter &&
      "periodsAfter" in filter &&
      "crossoverLevel" in filter
    );
  },

  isPercentileRankFilter: (
    filter: IFilter,
  ): filter is IPercentileRankFilter => {
    return (
      filter.varName === "percentileRank" &&
      "percentile" in filter &&
      !!filter.timeAgo
    );
  },

  isMtsiFilter: (filter: IFilter): filter is IMTSIFilter => {
    return filter.varName.includes("mtsi");
  },

  isTsiFilter: (filter: IFilter): filter is IMTSIFilter => {
    return filter.varName.includes("tsi");
  },

  isRsiDivergenceFilter: (filter: IFilter): filter is IRsiDivergenceFilter => {
    return (
      filter.varName === "rsiDivergence" &&
      "period" in filter &&
      "bullish" in filter
    );
  },

  isMacdDivergenceFilter: (
    filter: IFilter,
  ): filter is IMacdDivergenceFilter => {
    return (
      filter.varName === "macdDivergence" &&
      "periodsAfter" in filter &&
      "periodsBefore" in filter &&
      "lookback" in filter &&
      "fastPeriod" in filter &&
      "slowPeriod" in filter &&
      "bullish" in filter
    );
  },

  isRsiCrossoverFilter: (filter: IFilter): filter is IRsiCrossoverFilter => {
    return (
      filter.varName === "rsiCrossover" &&
      "period" in filter &&
      "periodsAfter" in filter &&
      "periodsBefore" in filter &&
      "bullish" in filter &&
      "crossoverLevel" in filter
    );
  },

  isPricePercentChangePercentileFilter: (
    filter: IFilter,
  ): filter is IPricePercentChangePercentileFilter => {
    return (
      filter.varName === "pricePercentChangePercentile" &&
      "timeAgo" in filter
    );
  },
};

function getPricePercentChangePercentileConfig(
  filter: IPricePercentChangePercentileFilter,
) {
  const period = Number(filter.timeAgo ?? filter.period ?? 0);
  const sessions = Number(filter.numberOfSessions ?? filter.lookback ?? 20);
  return {
    period,
    sessions,
  };
}

/**
 * Resolves a filter to its required variable names
 * @param filter The filter to resolve
 * @returns Array of variable names needed for this filter
 */
export function resolveFilterVariables(filter: IFilter): string[] {
  const variables: string[] = [];

  switch (true) {
    case FilterTypeGuards.isPricePercentChangePercentileFilter(filter):
      {
        const { period, sessions } = getPricePercentChangePercentileConfig(
          filter,
        );
        variables.push(
          VariableBuilders.pricePercentChangePercentile(period, sessions),
        );
      }
      break;

    case FilterTypeGuards.isMacdCrossOverFilter(filter):
      variables.push(VariableBuilders.priceEma(filter.fastPeriod));
      variables.push(VariableBuilders.priceEma(filter.slowPeriod));
      {
        const macdVarName = VariableBuilders.macd(
          filter.fastPeriod,
          filter.slowPeriod,
        );
        variables.push(macdVarName);
        const signalLineVarName = VariableBuilders.macdSignal(
          filter.fastPeriod,
          filter.slowPeriod,
          filter.signalPeriod,
        );
        variables.push(signalLineVarName);
        variables.push(
          VariableBuilders.macdCrossover(
            filter.fastPeriod,
            filter.slowPeriod,
            filter.signalPeriod,
            filter.crossoverLevel,
            filter.periodsBefore,
            filter.periodsAfter,
            filter.bullish ?? true,
          ),
        );
      }
      break;

    case FilterTypeGuards.isRsiCrossoverFilter(filter):
      variables.push(VariableBuilders.rsi(filter.period));
      variables.push(
        VariableBuilders.rsiCrossover(
          filter.period,
          filter.crossoverLevel,
          filter.periodsBefore,
          filter.periodsAfter,
          filter.bullish ?? true,
        ),
      );
      break;

    case FilterTypeGuards.isMacdFilter(filter):
      variables.push(VariableBuilders.priceEma(filter.fastPeriod));
      variables.push(VariableBuilders.priceEma(filter.slowPeriod));
      {
        const macdVarName = VariableBuilders.macd(
          filter.fastPeriod,
          filter.slowPeriod,
        );
        variables.push(macdVarName);
      }
      break;

    case FilterTypeGuards.isMtsiFilter(filter):
      variables.push(VariableBuilders.mtsiVwap(filter.vwapPeriod, true));
      variables.push(VariableBuilders.mtsiVwap(filter.vwapPeriod, false));
      variables.push(
        VariableBuilders.mtsiVwapEma(
          filter.vwapPeriod,
          filter.emaPeriod1,
          true,
        ),
      );
      variables.push(
        VariableBuilders.mtsiVwapEma2(
          filter.vwapPeriod,
          filter.emaPeriod1,
          filter.emaPeriod2,
          true,
        ),
      );
      variables.push(
        VariableBuilders.mtsiVwapEma(
          filter.vwapPeriod,
          filter.emaPeriod1,
          false,
        ),
      );
      variables.push(
        VariableBuilders.mtsiVwapEma2(
          filter.vwapPeriod,
          filter.emaPeriod1,
          filter.emaPeriod2,
          false,
        ),
      );
      variables.push(
        VariableBuilders.mtsi(
          filter.emaPeriod1,
          filter.emaPeriod2,
          filter.vwapPeriod,
        ),
      );
      variables.push(VariableBuilders.vwap(filter.vwapPeriod));
      break;

    case FilterTypeGuards.isTsiFilter(filter):
      variables.push(VariableBuilders.tsiEma(filter.emaPeriod1, true));
      variables.push(
        VariableBuilders.tsiEma2(filter.emaPeriod1, filter.emaPeriod2, true),
      );
      variables.push(VariableBuilders.tsiEma(filter.emaPeriod1, false));
      variables.push(
        VariableBuilders.tsiEma2(filter.emaPeriod1, filter.emaPeriod2, false),
      );
      variables.push(
        VariableBuilders.tsi(filter.emaPeriod1, filter.emaPeriod2),
      );
      break;

    case FilterTypeGuards.isPercentileRankFilter(filter):
      variables.push(
        `percentileRank${filter.percentile}Period${filter.timeAgo}`,
      );
      break;

    case FilterTypeGuards.isRsiDivergenceFilter(filter):
      variables.push(VariableBuilders.rsi(filter.period));
      variables.push(
        VariableBuilders.rsiDivergence(
          filter.period,
          filter.lookback,
          filter.periodsBefore,
          filter.periodsAfter,
          filter.bullish ?? true,
        ),
      );
      break;

    case FilterTypeGuards.isMacdDivergenceFilter(filter):
      variables.push(VariableBuilders.priceEma(filter.fastPeriod));
      variables.push(VariableBuilders.priceEma(filter.slowPeriod));
      variables.push(
        VariableBuilders.macd(filter.fastPeriod, filter.slowPeriod),
      );
      variables.push(
        VariableBuilders.macdDivergence(
          filter.fastPeriod,
          filter.slowPeriod,
          filter.lookback,
          filter.periodsBefore,
          filter.periodsAfter,
          filter.bullish ?? true,
        ),
      );
      break;

    default:
      variables.push(StrategyUtil.convertToVariableName(filter));
      break;
  }

  // Add compare variable if present
  if (filter.compareVar) {
    variables.push(StrategyUtil.convertToCompareVarName(filter));
  }

  return variables;
}

/**
 * Resolves the primary variable produced by a variable definition.
 * This is used when callers need the final output value for display.
 */
export function resolvePrimaryVariable(filter: IFilter): string {
  switch (true) {
    case FilterTypeGuards.isPricePercentChangePercentileFilter(filter):
      {
        const { period, sessions } = getPricePercentChangePercentileConfig(
          filter,
        );
        return VariableBuilders.pricePercentChangePercentile(period, sessions);
      }

    case FilterTypeGuards.isMacdCrossOverFilter(filter):
      return VariableBuilders.macdCrossover(
        filter.fastPeriod,
        filter.slowPeriod,
        filter.signalPeriod,
        filter.crossoverLevel,
        filter.periodsBefore,
        filter.periodsAfter,
        filter.bullish ?? true,
      );

    case FilterTypeGuards.isRsiCrossoverFilter(filter):
      return VariableBuilders.rsiCrossover(
        filter.period,
        filter.crossoverLevel,
        filter.periodsBefore,
        filter.periodsAfter,
        filter.bullish ?? true,
      );

    case FilterTypeGuards.isMacdFilter(filter):
      return VariableBuilders.macd(filter.fastPeriod, filter.slowPeriod);

    case FilterTypeGuards.isMtsiFilter(filter):
      return VariableBuilders.mtsi(
        filter.emaPeriod1,
        filter.emaPeriod2,
        filter.vwapPeriod,
      );

    case FilterTypeGuards.isTsiFilter(filter):
      return VariableBuilders.tsi(filter.emaPeriod1, filter.emaPeriod2);

    case FilterTypeGuards.isPercentileRankFilter(filter):
      return `percentileRank${filter.percentile}Period${filter.timeAgo}`;

    case FilterTypeGuards.isRsiDivergenceFilter(filter):
      return VariableBuilders.rsiDivergence(
        filter.period,
        filter.lookback,
        filter.periodsBefore,
        filter.periodsAfter,
        filter.bullish ?? true,
      );

    case FilterTypeGuards.isMacdDivergenceFilter(filter):
      return VariableBuilders.macdDivergence(
        filter.fastPeriod,
        filter.slowPeriod,
        filter.lookback,
        filter.periodsBefore,
        filter.periodsAfter,
        filter.bullish ?? true,
      );

    default:
      return StrategyUtil.convertToVariableName(filter);
  }
}
