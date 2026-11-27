import React, { ChangeEvent } from "react";
import { InputText } from "primereact/inputtext";
import { Dropdown, DropdownChangeEvent } from "primereact/dropdown";
import { Checkbox, CheckboxChangeEvent } from "primereact/checkbox";
import { barPeriodOptions, isBullish } from "./filter-variables";

interface IFilterMappingProps {
  makeChange: (name: string, value: string, index: number) => void;
  filter: { [key: string]: string };
  index: number;
  varName: string;
  compareVar?: boolean;
  /** Strategy candle period (1, 5, 10, 30, …) used to validate session limits */
  period?: number;
}

const MAX_PERCENTILE_SESSIONS: Partial<Record<number, number>> = {
  1: 2,
  5: 10,
  10: 20,
  30: 30,
};

const bandOptions = [
  { label: "Upper", value: "upper" },
  { label: "Middle", value: "middle" },
  { label: "Lower", value: "lower" },
];

/**
 * The inputs for a variable's params. Field names match what the backend's
 * src/engine/filter-specs.ts reads. Only `timeAgo` is per side (the compare
 * variable's is `compareVarTimeAgo`); every other param is shared by both
 * sides of the filter, because that is how the engine reads them.
 */
export const getFilter = ({
  varName,
  makeChange,
  filter,
  index,
  compareVar,
  period,
}: IFilterMappingProps): React.ReactNode => {
  const timeAgoField = compareVar ? "compareVarTimeAgo" : "timeAgo";
  const idPrefix = `${compareVar ? "compare-" : ""}${varName}-${index}`;

  const text = (label: string, field: string, placeholder?: string) => (
    <span key={field}>
      <label htmlFor={`${idPrefix}-${field}`}> {label}: </label>
      <InputText
        id={`${idPrefix}-${field}`}
        value={filter[field] ?? ""}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          makeChange(field, e.target.value, index)
        }
      />{" "}
    </span>
  );

  const barPeriod = (label: string, field: string, placeholder: string) => (
    <span key={field}>
      <label htmlFor={`${idPrefix}-${field}`}> {label}: </label>
      <Dropdown
        inputId={`${idPrefix}-${field}`}
        placeholder={placeholder}
        value={filter[field] ? String(filter[field]) : undefined}
        options={barPeriodOptions}
        showClear={field === timeAgoField}
        onChange={(e: DropdownChangeEvent) =>
          makeChange(field, e.value ?? "", index)
        }
      />{" "}
    </span>
  );

  const bullish = (
    <span key="bullish">
      <Checkbox
        inputId={`${idPrefix}-bullish`}
        checked={isBullish(filter.bullish)}
        onChange={(e: CheckboxChangeEvent) =>
          makeChange("bullish", String(Boolean(e.checked)), index)
        }
      />
      <label htmlFor={`${idPrefix}-bullish`}> Bullish </label>
    </span>
  );

  const fastSlow = [
    text("Fast period", "fastPeriod"),
    text("Slow period", "slowPeriod"),
  ];

  switch (varName) {
    case "percentchange":
      return <span>{text("In last (periods)", timeAgoField)}</span>;
    case "pricePercentChangePercentile": {
      const sessions = filter.numberOfSessions || "20";
      const currentSessions = parseInt(sessions, 10);
      const maxSessions =
        period !== undefined ? MAX_PERCENTILE_SESSIONS[period] : undefined;
      const sessionsError =
        maxSessions !== undefined &&
        Number.isInteger(currentSessions) &&
        currentSessions > maxSessions
          ? `Number of sessions cannot exceed ${maxSessions} for a ${period}-minute period`
          : "";
      return (
        <span>
          {text("In last (periods)", timeAgoField)}
          <br />
          {text("Number of sessions", "numberOfSessions", "20")}
          {sessionsError && (
            <small style={{ color: "red", display: "block" }}>
              {sessionsError}
            </small>
          )}
        </span>
      );
    }
    case "priceEma":
    case "priceSma":
    case "volumeSma":
    case "bollingerUpper":
    case "bollingerLower":
    case "rsi":
      return <span>{text("Period", timeAgoField)}</span>;
    case "bollingerBands":
      return (
        <span>
          {text("Period", timeAgoField)}
          {text("Multiplier", "multiplier", "2")}
          <span>
            <label htmlFor={`${idPrefix}-band`}> Band: </label>
            <Dropdown
              inputId={`${idPrefix}-band`}
              value={filter.band || "upper"}
              options={bandOptions}
              onChange={(e: DropdownChangeEvent) =>
                makeChange("band", e.value, index)
              }
            />
          </span>
        </span>
      );
    case "vwap":
      return (
        <span>
          {barPeriod("Bar period", timeAgoField, "Strategy period")}
        </span>
      );
    case "macd":
      return <>{fastSlow}</>;
    case "macdSignal":
    case "macdSignalLine":
      return (
        <>
          {fastSlow}
          {text("Signal period", "signalPeriod", "9")}
        </>
      );
    case "macdCrossover":
      return (
        <>
          {bullish}
          {fastSlow}
          {text("Signal period", "signalPeriod", "9")}
          {text("Periods before", "periodsBefore")}
          {text("Periods after", "periodsAfter")}
        </>
      );
    case "rsiCrossover":
      return (
        <>
          {bullish}
          {text("RSI period", "period")}
          {text("Periods before", "periodsBefore")}
          {text("Periods after", "periodsAfter")}
          {text("Crossover level", "crossoverLevel", "50")}
        </>
      );
    case "rsiDivergence":
      return (
        <>
          {bullish}
          {text("RSI period", "period")}
          {text("Lookback", "lookback")}
        </>
      );
    case "macdDivergence":
      return (
        <>
          {bullish}
          {fastSlow}
          {text("Lookback", "lookback")}
        </>
      );
    case "tsi":
      return (
        <>
          {text("M period", "emaPeriod1")}
          {text("N period", "emaPeriod2")}
        </>
      );
    case "mtsi":
      return (
        <>
          {text("M period", "emaPeriod1")}
          {text("N period", "emaPeriod2")}
          {barPeriod("VWAP bar period", "vwapPeriod", "Select a period")}
        </>
      );
    default:
      return null;
  }
};
