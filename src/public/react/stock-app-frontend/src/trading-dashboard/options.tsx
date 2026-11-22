// OptionTypes.tsx
import { Checkbox, CheckboxChangeEvent } from "primereact/checkbox";
import React from "react";
import { IDropDownItem } from "../shared/types";

interface IProps {
  selectOptionType: (
    e: CheckboxChangeEvent,
    length: IDropDownItem,
    time: IDropDownItem,
  ) => void;
  selectOptionLengths: (e: CheckboxChangeEvent, length: string) => void;
  selectedOptionTypes: { [key: string]: string[] };
}

const optionLengths: IDropDownItem[] = [
  { label: "Weeklies", value: "weeklies" },
  { label: "Short term", value: "shortTerm" },
  { label: "Medium term", value: "mediumTerm" },
  { label: "Long term", value: "longTerm" },
  { label: "Leaps", value: "leaps" },
];

const optionTypes: IDropDownItem[] = [
  { label: "Deep ITM", value: "deepItm" },
  { label: "ITM", value: "itm" },
  { label: "ATM", value: "atm" },
  { label: "OTM", value: "otm" },
  { label: "Deep OTM", value: "deepOtm" },
];

export function OptionTypes({
  selectOptionType,
  selectOptionLengths,
  selectedOptionTypes,
}: IProps) {
  return (
    <div className="option-types-grid">
      {optionLengths.map((length) => {
        const isLengthSelected = !!selectedOptionTypes[length.value]?.length;

        return (
          <div key={length.value} className="length-group mb-4">
            {/* Master checkbox for the entire length */}
            <div className="flex align-items-center mb-2">
              <Checkbox
                checked={isLengthSelected}
                onChange={(e) => selectOptionLengths(e, length.value)}
              />
              <label className="ml-2 font-medium">{length.label}</label>
            </div>

            {/* Nested moneyness options - indented */}
            <div className="ml-6 grid grid-cols-2 gap-3">
              {optionTypes.map((type) => {
                const isChecked = selectedOptionTypes[length.value]?.includes(
                  type.value,
                );

                return (
                  <div key={type.value} className="flex align-items-center">
                    <Checkbox
                      checked={!!isChecked}
                      onChange={(e) => selectOptionType(e, length, type)}
                      disabled={!isLengthSelected && !isChecked} // optional: disable if parent not selected
                    />
                    <label className="ml-2 text-sm">{type.label}</label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
