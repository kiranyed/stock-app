import { IFilterData } from "../../types/data-processing-types";
import { IFilter, IFilterGroup } from "../../types/strategy-types";
import { PeriodType } from "../constants";
import {
  FilterVariable,
  compareVariable,
  primaryVariable,
} from "../../engine/filter-specs";

export class FilterGroup {
  private filterGroup: IFilterGroup;
  /** per filter: the names its two sides are read under, and its parsed constants */
  private readonly names: {
    primary: string;
    compare?: string;
    coefficient: number;
    constant: number;
  }[];
  private readonly variables: FilterVariable[];

  constructor(group: IFilterGroup, period: PeriodType) {
    this.filterGroup = group;
    this.variables = [];
    this.names = group.filters.map((filter) => {
      const primary = primaryVariable(filter, period);
      const compare = compareVariable(filter, period);
      this.variables.push(primary);
      if (compare) this.variables.push(compare);
      return {
        primary: primary.name,
        compare: compare?.name,
        coefficient: parseFloat(filter.compareVarCoefficient || "1"),
        constant: parseFloat(filter.compareVal),
      };
    });
  }

  /** every variable this group's filters read */
  getVariables(): FilterVariable[] {
    return this.variables;
  }

  get filters() {
    return this.filterGroup.filters;
  }

  get connectors() {
    return this.filterGroup.connectors;
  }

  run(filterData: IFilterData, stock: string) {
    const { filters, connectors } = this;
    let currentVal = false;
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const connector = connectors[i - 1];
      const op = this.evaluateExpression(filter, stock, filterData, i);
      currentVal =
        i > 0 ? this.resolveConnector(currentVal, op, connector) : op;
    }
    return currentVal;
  }

  evaluateExpression(
    expr: IFilter,
    stock: string,
    filterData: IFilterData,
    index: number,
  ) {
    const { primary, compare, coefficient, constant } = this.names[index];
    const val1 = filterData[primary]?.[stock];
    const val2 = compare
      ? coefficient * (filterData[compare]?.[stock] ?? NaN)
      : constant;

    return this.resolveOperator(val1, val2, expr.operator);
  }

  resolveOperator(
    op1: number | string,
    op2: number | string,
    operator: string,
  ) {
    if (!op1 || op1 === "placeholder") {
      return false;
    }
    switch (operator) {
      case "=":
        return op1 === op2;
      case "!=":
        return op1 !== op2;
      case ">=":
        return op1 >= op2;
      case ">":
        return op1 > op2;
      case "<=":
        return op1 <= op2;
      case "<":
        return op1 < op2;
      default:
        return false;
    }
  }

  resolveConnector(operand1: boolean, operand2: boolean, op: string) {
    if (!op) {
      // tslint:disable-next-line: no-debugger
      throw new Error("op is undefined or null in FilterGroup ");
    }
    const lop = op.toLowerCase();
    switch (lop) {
      case "and":
        return operand1 && operand2;
      case "or":
        return operand1 || operand2;

      /* never used below 2 so far*/
      case "xor":
        return (operand1 && !operand2) || (!operand1 && operand2);
      case "nand":
        return !(operand1 && operand2);
      default:
        throw new Error(
          "connector can only be one of the following: and, or, xor, nand",
        );
    }
  }

  getFilters() {
    return this.filterGroup.filters;
  }
}
