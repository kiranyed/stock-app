import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { RadioButton } from "primereact/radiobutton";
import React, { ChangeEvent, useState } from "react";
import {
  IDropDownItem,
  IFilter,
  IFlagFilterGroupPair,
} from "../../shared/types";
import { getFilter } from "./filter-util";
import {
  analysisOptions,
  entryOptions,
  exitOptions,
  isSignalVariable,
} from "./filter-variables";
import { wouldCreateCycle } from "./flag-util";

// Operator and variable options
const operatorOptions: IDropDownItem[] = [
  { label: "Greater than", value: ">" },
  { label: "Greater than or equal to", value: ">=" },
  { label: "Less than", value: "<" },
  { label: "Less than or equal to", value: "<=" },
  { label: "Equal", value: "=" },
];

interface IProps {
  makeChange: (varName: string, val: string, index: number) => void;
  index: number;
  filter: IFilter;
  editingGroup?: boolean;
  type?: string;
  dataFilter?: boolean;
  flags?: IFlagFilterGroupPair[];
  flagName?: string;
  /** Strategy candle period passed down for session limit validation */
  period?: number;
  /** Overrides the variable list picked from `type` */
  variableOptions?: IDropDownItem[];
}

export function Filter(props: IProps) {
  const className = "";
  const [constant, setConstant] = useState(props.filter.compareVar === "");
  const [booleanFilter, setBooleanFilter] = useState(
    isSignalVariable(props.filter.varName),
  );

  const changeCompare = (constantVal: boolean) => {
    setConstant(constantVal);
    if (constantVal) {
      props.makeChange("compareVar", "", props.index);
    } else {
      props.makeChange("compareVal", "", props.index);
    }
  };

  const makeChange = (key: string, value: string, index: number) => {
    // Only a change of variable switches between "is true" and a comparison;
    // editing a signal's params must not.
    if (key === "varName") {
      const signal = isSignalVariable(value);
      if (signal) {
        props.makeChange("operator", "=", index);
        props.makeChange("compareVal", "1", index);
      }
      setBooleanFilter(signal);
    }
    props.makeChange(key, value, index);
  };

  const additionalInputs = getFilter({
    makeChange,
    varName: props.filter.varName,
    filter: { ...props.filter },
    index: props.index,
    period: props.period,
  });

  const compareTimeAgoInput = props.filter.compareVar
    ? getFilter({
        makeChange: props.makeChange,
        varName: props.filter.compareVar,
        filter: { ...props.filter },
        index: props.index,
        compareVar: true,
        period: props.period,
      })
    : null;

  // Copy: flags are appended below, and the lists are shared module constants.
  const options: IDropDownItem[] = [
    ...(props.variableOptions ??
      (props.type === "sell" || props.type === "cover"
        ? exitOptions
        : props.type
          ? entryOptions
          : analysisOptions)),
  ];

  const currentFlagName = props.flagName || "";
  if (props.flags) {
    props.flags.forEach((flag) => {
      const flagName = flag.name;
      const disable =
        flagName === currentFlagName ||
        wouldCreateCycle(currentFlagName, flagName, props.flags || []);
      options.push({
        label: flagName,
        value: flagName,
        disabled: disable,
      });
    });
  }

  return (
    <div className={className + " filter"}>
      <Dropdown
        placeholder={"Variable name"}
        value={props.filter.varName}
        options={options}
        onChange={(e) => makeChange("varName", e.value, props.index)}
        disabled={props.editingGroup}
      />
      {additionalInputs}
      {booleanFilter ? (
        <span> is True</span>
      ) : (
        <div hidden={props.dataFilter}>
          <Dropdown
            placeholder={"Operator name"}
            value={props.filter.operator}
            options={operatorOptions}
            onChange={(e) => props.makeChange("operator", e.value, props.index)}
            disabled={props.editingGroup}
          />
          <br />
          <RadioButton
            name="type"
            value="Constant"
            onChange={() => changeCompare(true)}
            checked={constant}
          />
          <label>Constant</label>
          <br />
          <RadioButton
            inputId="city2"
            name="type"
            value="Variable"
            onChange={() => changeCompare(false)}
            checked={!constant}
          />
          <label htmlFor="city2">Variable</label>
          <br />
          {constant ? (
            <InputText
              placeholder={"Compare value"}
              value={props.filter.compareVal}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                props.makeChange("compareVal", e.target.value, props.index)
              }
              disabled={props.editingGroup}
            />
          ) : (
            <span>
              <label htmlFor={`compareVarCoefficient${props.index}`}>
                Coefficient
              </label>
              <InputText
                value={props.filter.compareVarCoefficient}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  props.makeChange(
                    `compareVarCoefficient`,
                    e.target.value,
                    props.index,
                  )
                }
                id={`compareVarCoefficient${props.index}`}
                placeholder="Coefficient"
              />{" "}
              x
              <Dropdown
                placeholder={"Compare variable name"}
                value={props.filter.compareVar}
                options={options}
                onChange={(e) =>
                  props.makeChange("compareVar", e.value, props.index)
                }
                disabled={props.editingGroup}
              />
              {compareTimeAgoInput}
            </span>
          )}
        </div>
      )}
      <br />
      <br />
    </div>
  );
}
