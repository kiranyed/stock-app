import { IFilterData } from "../../types/data-processing-types";
import { IFilter, IFilterGroup } from "../../types/strategy-types";
import { StrategyUtil } from "../utilities/strategy-util";

export class FilterGroup {
  private filterGroup: IFilterGroup;
  constructor(group: IFilterGroup) {
    this.filterGroup = group;
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
      const op = this.evaluateExpression(filter, stock, filterData);
      currentVal =
        i > 0 ? this.resolveConnector(currentVal, op, connector) : op;
    }
    return currentVal;
  }

  // evaluateExpression(expr: IFilter, stock: string, filterData: IFilterData) {
  //     const { operator, compareVal, compareVar } = expr;
  //     const vars = filterData;
  //     const prop1 = StrategyUtil.convertToVariableName(expr);
  //     let prop2;
  //     let val2;
  //     const val1 = vars[prop1][stock];
  //     if (compareVar) {
  //         prop2 = StrategyUtil.convertToCompareVarName(expr);
  //         val2 = vars[prop2][stock];
  //     }

  //     let compareValCasted = compareVar
  //         ? (expr.compareVarCoefficient ? parseInt(expr.compareVarCoefficient, 10) : 1) * (val2 !== undefined ? val2 : NaN)
  //         : compareVal;
  //     compareValCasted = compareVal;
  //     if (typeof val1 !== 'string') {
  //         compareValCasted = parseFloat(compareValCasted);
  //     }
  //     return this.resolveOperator(val1, compareValCasted, operator);
  // }

  evaluateExpression(expr: IFilter, stock: string, filterData: IFilterData) {
    const { operator, compareVal, compareVar } = expr;
    const vars = filterData;
    const prop1 = StrategyUtil.convertToVariableName(expr);
    let prop2;
    let val2;

    const val1 = vars[prop1][stock];
    if (compareVar) {
      prop2 = StrategyUtil.convertToCompareVarName(expr);
      val2 = vars[prop2][stock];
    }

    // unit test
    if (prop2 === "priceEma50" && val2) {
      // eslint-disable-next-line no-self-assign
      val2 = val2;
    }
    const compareVarCoefficient = parseFloat(expr.compareVarCoefficient || "1");

    return this.resolveOperator(
      val1,
      val2 ? compareVarCoefficient * val2 : parseFloat(compareVal),
      operator,
    );
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
