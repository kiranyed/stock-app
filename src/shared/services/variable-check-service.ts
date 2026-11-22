import Error400 from "../../errors/error-400";
import Error404 from "../../errors/error-404";
import { PeriodType } from "../constants";
import { BackTestService } from "../../run/back-test-service";
import StockGroupRepository from "./repos/stock-group-repository";
import { IFilter } from "../../types/strategy-types";
import {
  IVariableCheckRow,
  VariableCheckBackTest,
} from "../../analysis/variable-check-back-test";
import { IStockGroup } from "../../types/entity-types";
import {
  resolveFilterVariables,
  resolvePrimaryVariable,
} from "../utilities/filter-variable-resolver";

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
    groupId: number,
    variables: IVariableDefinition[],
    startTime?: number,
    endTime?: number,
  ): Promise<IVariableCheckResponse> {
    const normalizedVariables = this.normalizeVariables(variables);
    const group = await this.getGroupById(groupId);

    const resolvedRange = this.resolveTimeRange(startTime, endTime);
    const variableJob = new VariableCheckBackTest(normalizedVariables);

    const result = await BackTestService.runBackTests([variableJob], group, {
      startTime: resolvedRange.startTime,
      endTime: resolvedRange.endTime,
      minimumPeriod: PeriodType.DAY,
    });

    return {
      variables: variableJob.getRequestedVariables(),
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

      const dependencies = resolveFilterVariables(normalizedFilter);
      const primaryVariable = resolvePrimaryVariable(normalizedFilter);
      const hasInvalidKey = [...dependencies, primaryVariable].some(
        (name) => name.includes("undefined") || name.includes("NaN"),
      );
      if (hasInvalidKey) {
        throw new Error400(
          `Variable at index ${index} is missing required parameters for ${variable.varName}`,
        );
      }

      return normalizedFilter;
    });
  }

  private static async getGroupById(groupId: number): Promise<IStockGroup> {
    const response = await StockGroupRepository.getGroupById(groupId);
    const group = response[0];
    if (!group) {
      throw new Error404(`${groupId} not found`);
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
