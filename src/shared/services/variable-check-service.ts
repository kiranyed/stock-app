import Error400 from "../../errors/error-400";
import Error404 from "../../errors/error-404";
import { PeriodType } from "../constants";
import { BackTestPool } from "../../run/back-test-pool";
import StockGroupRepository from "./repos/stock-group-repository";
import { IFilter } from "../../types/strategy-types";
import {
  IVariableCheckRow,
  VariableCheckBackTest,
} from "../../analysis/variable-check-back-test";
import { IStockGroup } from "../../types/entity-types";
import { filterVariables } from "../../engine/filter-specs";
import { InvalidSpecError } from "../../engine/specs";

const DEFAULT_LOOKBACK_DAYS = 400;

export type IVariableDefinition = Partial<IFilter> & {
  varName: string;
};

export interface IVariableCheckResponse {
  variables: string[];
  rows: IVariableCheckRow[];
}

export class VariableCheckService {
  static async getVariableValuesForGroup(
    userId: number,
    groupId: number,
    variables: IVariableDefinition[],
    startTime?: number,
    endTime?: number,
  ): Promise<IVariableCheckResponse> {
    const normalizedVariables = this.normalizeVariables(variables);
    const group = await this.getOwnedGroupById(userId, groupId);

    const resolvedRange = this.resolveTimeRange(startTime, endTime);
    const { results: result } = await BackTestPool.run(userId, {
      kind: "variables",
      variables: normalizedVariables,
      group,
      config: {
        startTime: resolvedRange.startTime,
        endTime: resolvedRange.endTime,
        minimumPeriod: PeriodType.DAY,
      },
    });

    return {
      // the worker ran its own copy; this one only names the columns
      variables: new VariableCheckBackTest(normalizedVariables).getRequestedVariables(),
      rows: result[0] as IVariableCheckRow[],
    };
  }

  private static normalizeVariables(variables: IVariableDefinition[]): IFilter[] {
    if (!Array.isArray(variables) || variables.length === 0) {
      throw new Error400("variables must be a non-empty array");
    }

    return variables.map((variable, index) => {
      if (!variable || typeof variable.varName !== "string" || !variable.varName) {
        throw new Error400(`Variable at index ${index} must include varName`);
      }

      const normalizedFilter: IFilter = {
        operator: "=",
        compareVal: "0",
        ...variable,
      } as IFilter;

      try {
        filterVariables(normalizedFilter, PeriodType.DAY);
      } catch (err) {
        if (err instanceof InvalidSpecError) {
          throw new Error400(`Variable at index ${index}: ${err.message}`);
        }
        throw err;
      }

      return normalizedFilter;
    });
  }

  private static async getOwnedGroupById(userId: number, groupId: number): Promise<IStockGroup> {
    const rows = await StockGroupRepository.getOwnedGroup(groupId, userId);
    const group = rows[0];
    if (!group) {
      throw new Error404("stock group not found");
    }

    const symbols = group.symbols;
    // try {
    //   symbols = JSON.parse(group.symbols);
    // } catch {
    //   throw new Error400(`Group ${groupId} has invalid symbols payload`);
    // }

    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new Error400(`Group ${groupId} has no symbols`);
    }

    return {
      id: group.id,
      name: group.name,
      symbols,
    };
  }

  private static resolveTimeRange(startTime?: number, endTime?: number) {
    const resolvedEnd = Number.isFinite(endTime) ? Number(endTime) : Date.now();
    const resolvedStart = Number.isFinite(startTime)
      ? Number(startTime)
      : resolvedEnd - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    if (!Number.isInteger(resolvedStart) || !Number.isInteger(resolvedEnd)) {
      throw new Error400("startTime and endTime must be integers");
    }

    if (resolvedStart >= resolvedEnd) {
      throw new Error400("startTime must be less than endTime");
    }

    return { startTime: resolvedStart, endTime: resolvedEnd };
  }
}
