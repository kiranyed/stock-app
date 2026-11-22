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
import { wouldCreateCycle } from "./flag-util";

// Operator and variable options
const operatorOptions: IDropDownItem[] = [
  { label: "Greater than", value: ">" },
  { label: "Greater than or equal to", value: ">=" },
  { label: "Less than", value: "<" },
  { label: "Less than or equal to", value: "<=" },
  { label: "Equal", value: "=" },
];

const variableOptions1: IDropDownItem[] = [
  { label: "Percent change", value: "percentchange" },
  {
    label: "Percent change percentile rank",
    value: "pricePercentChangePercentile",
  },
  { label: "Volume change", value: "volumechange" },
  { label: "MTSI", value: "mtsi" },
  { label: "TSI", value: "tsi" },
  { label: "MACD", value: "macdSignalLine" },
  { label: "RSI", value: "rsi" },
  { label: "ADX", value: "adx" },
  { label: "Bollinger Bands", value: "bollingerBands" },
  { label: "EMA", value: "priceEma" },
  { label: "SMA", value: "priceSma" },
  { label: "VWAP", value: "vwap" },
  { label: "RSI Crossover", value: "rsiCrossover" },
  { label: "MACD crossover", value: "macdCrossover" },
  { label: "RSI Divergence", value: "rsiDivergence" },
  { label: "Volume SMA", value: "volumeSma" },
  { label: "MACD Divergence", value: "macdDivergence" },
  { label: "Price", value: "price" },
];

const variableOptions3: IDropDownItem[] = [
  { label: "Percent change", value: "percentchange" },
  {
    label: "Percent change percentile rank",
    value: "pricePercentChangePercentile",
  },
  { label: "Volume moving average", value: "volumeSma" },
  { label: "Price simple moving average", value: "priceSma" },
  { label: "Price Exponential moving average", value: "priceEma" },
  { label: "Volume change", value: "volumeChange" },
  { label: "MTSI", value: "mtsi" },
  { label: "TSI", value: "tsi" },
  { label: "MACD", value: "macdSignalLine" },
  { label: "RSI", value: "rsi" },
  { label: "Time since entry (number of periods)", value: "timeSinceEntry" },
  { label: "Percent gain since purchase", value: "percentGain" },
  { label: "Price", value: "price" },
];

const variableOptions2: IDropDownItem[] = [
  { label: "Market cap", value: "marketcap" },
  { label: "Percent change", value: "percentchange" },
  { label: "Volume change", value: "volumechange" },
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
}

export function Filter(props: IProps) {
  const className = "";
  const [constant, setConstant] = useState(props.filter.compareVar === "");
  const [booleanFilter, setBooleanFilter] = useState(
    props.filter.varName.includes("Crossover") ||
      props.filter.varName.includes("Divergence"),
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
    if (
      key.includes("varName") &&
      (value.includes("Crossover") || value.includes("Divergence"))
    ) {
      props.makeChange("operator", "=", index);
      props.makeChange("compareVal", "1", index);
      setBooleanFilter(true);
    } else {
      setBooleanFilter(false);
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

  const options =
    props.type === "sell" || props.type === "cover"
      ? variableOptions3
      : props.type
        ? variableOptions1
        : variableOptions2;

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
