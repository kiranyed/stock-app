import React, { ChangeEvent } from "react";
import { InputText } from "primereact/inputtext";
import { Dropdown, DropdownChangeEvent } from "primereact/dropdown";
import { Checkbox, CheckboxChangeEvent } from "primereact/checkbox";

interface IFilterMappingProps {
  makeChange: (
    name: string,
    value: string,
    index: number,
    compareVar?: boolean,
  ) => void;
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

export const getFilter = ({
  varName,
  makeChange,
  filter,
  index,
  compareVar,
  period,
}: IFilterMappingProps) => {
  let input: React.ReactNode;
  const prefix = compareVar ? "compareVar" : "";
  // make this an if statement.  check if isMacDfilter(filter): filter is IMacdFilter , which will give
  // the macd properties (IMacdFilter will extend IFilter, and it will have fastPeriod
  // and slowPeriod properties).  and instead of passing "value" in the props, pass in the filter
  const timeAgoVarName = compareVar ? "compareVarTimeAgo" : "timeAgo";
  switch (varName) {
    case "percentchange":
      input = (
        <span>
          <label> in last: </label>
          <InputText
            value={filter.timeAgo}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(timeAgoVarName, e.target.value, index, compareVar)
            }
          />
          <label> units of time </label>
        </span>
      );
      break;
    case "pricePercentChangePercentile": {
      const currentSessions = parseInt(filter.numberOfSessions || "20", 10);
      const maxSessions =
        period !== undefined ? MAX_PERCENTILE_SESSIONS[period] : undefined;
      const sessionsError =
        maxSessions !== undefined &&
        Number.isInteger(currentSessions) &&
        currentSessions > maxSessions
          ? `Number of sessions cannot exceed ${maxSessions} for a ${period}-minute period`
          : "";
      input = (
        <span>
          <label> in last: </label>
          <InputText
            value={filter.timeAgo}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(timeAgoVarName, e.target.value, index, compareVar)
            }
          />
          <label> units of time </label>
          <br />
          <label> Number of sessions: </label>
          <InputText
            value={filter.numberOfSessions || "20"}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}numberOfSessions`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          {sessionsError && (
            <small style={{ color: "red", display: "block" }}>
              {sessionsError}
            </small>
          )}
        </span>
      );
      break;
    }
    case "macdSignal":
      input = (
        <>
          <label> Fast period: </label>
          <InputText
            value={filter.fastPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}fastPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <br />
          <label> Slow period: </label>
          <InputText
            value={filter.slowPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}slowPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />

          <label> Signal Period: </label>
          <InputText
            value={filter.signalPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}signalPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    case "macd":
      input = (
        <>
          <label> Fast period: </label>
          <InputText
            value={filter.fastPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}fastPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <br />
          <label> Slow period: </label>
          <InputText
            value={filter.slowPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}slowPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    case "tsi":
      input = (
        <>
          <label> M period: </label>
          <InputText
            value={filter.emaPeriod1}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}mPeriod`, e.target.value, index, compareVar)
            }
          />
          <br />
          <label> N period: </label>
          <InputText
            value={filter.emaPeriod2}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}nPeriod`, e.target.value, index, compareVar)
            }
          />
        </>
      );
      break;
    case "mtsi":
      input = (
        <>
          <label> M period: </label>
          <InputText
            value={filter.emaPeriod1}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}emaPeriod1`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <br />
          <label> N period: </label>
          <InputText
            value={filter.emaPeriod2}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}emaPeriod2`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />

          <label> Vwap period type: </label>
          <Dropdown
            placeholder="Select a period length"
            value={filter.vwapPeriod}
            options={[
              { label: "1 minute", value: "1" },
              { label: "5 minutes", value: "5" },
              { label: "15 minutes", value: "15" },
              { label: "30 minutes", value: "30" },
            ]}
            onChange={(e: DropdownChangeEvent) =>
              makeChange(`${prefix}vwapPeriod`, e.value, index, compareVar)
            }
          ></Dropdown>
        </>
      );
      break;
    case "priceEma":
    case "priceSma":
    case "volumeEma":
    case "bollingerUpper":
    case "bollingerLower":
    case "rsi":
    case "adx":
      input = (
        <span>
          <label> Period: </label>
          <InputText
            value={compareVar ? filter.compareVarTimeAgo : filter.timeAgo}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(timeAgoVarName, e.target.value, index, compareVar)
            }
          />
        </span>
      );
      break;
    case "rsiCrossover":
      input = (
        <>
          <label>Bullish</label>
          <Checkbox
            checked={Boolean(filter.bullish)}
            onChange={(e: CheckboxChangeEvent) =>
              makeChange(
                `${prefix}bullish`,
                String(e.checked),
                index,
                compareVar,
              )
            }
          />
          <label>Rsi period</label>
          <InputText
            value={filter.period}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}period`, e.target.value, index, compareVar)
            }
          />
          <label> Periods After: </label>
          <InputText
            value={filter.periodsAfter}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsAfter`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Periods Before: </label>
          <InputText
            value={filter.periodsBefore}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsBefore`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Crossover Level: </label>
          <InputText
            value={filter.crossoverLevel}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}crossoverLevel`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    case "macdCrossover":
      input = (
        <>
          <label>Bullish</label>
          <Checkbox
            checked={Boolean(filter.bullish)}
            onChange={(e: CheckboxChangeEvent) =>
              makeChange(
                `${prefix}bullish`,
                String(e.checked),
                index,
                compareVar,
              )
            }
          />
          <label> Fast period: </label>
          <InputText
            value={filter.fastPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}fastPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <br />
          <label> Slow period: </label>
          <InputText
            value={filter.slowPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}slowPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />

          <label> Signal Period: </label>
          <InputText
            value={filter.signalPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}signalPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Periods Above: </label>
          <InputText
            value={filter.periodsAfter}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsAfter`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Periods Below: </label>
          <InputText
            value={filter.periodsBefore}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsBefore`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Crossover Level: </label>
          <InputText
            value={filter.crossoverLevel}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}crossoverLevel`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    case "macdDivergence":
      input = (
        <>
          <label>Bullish</label>
          <Checkbox
            checked={Boolean(filter.bullish)}
            onChange={(e: CheckboxChangeEvent) =>
              makeChange(
                `${prefix}bullish`,
                String(e.checked),
                index,
                compareVar,
              )
            }
          />
          <label>Fast period</label>
          <InputText
            value={filter.fastPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}fastPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Slow period: </label>
          <InputText
            value={filter.slowPeriod}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}slowPeriod`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />

          <label> Lookback period: </label>
          <InputText
            value={filter.lookback}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}lookback`, e.target.value, index, compareVar)
            }
          />

          <label> Periods Before: </label>
          <InputText
            value={filter.periodsBefore}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsBefore`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Periods After: </label>
          <InputText
            value={filter.periodsAfter}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsAfter`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    case "rsiDivergence":
      input = (
        <>
          <label>Bullish</label>
          <Checkbox
            checked={Boolean(filter.bullish)}
            onChange={(e: CheckboxChangeEvent) =>
              makeChange(
                `${prefix}bullish`,
                String(e.checked),
                index,
                compareVar,
              )
            }
          />
          <label>Rsi period</label>
          <InputText
            value={filter.period}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}period`, e.target.value, index, compareVar)
            }
          />

          <label> Lookback period: </label>
          <InputText
            value={filter.lookback}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(`${prefix}lookback`, e.target.value, index, compareVar)
            }
          />
          <label> Periods Before: </label>
          <InputText
            value={filter.periodsBefore}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsBefore`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
          <label> Periods After: </label>
          <InputText
            value={filter.periodsAfter}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              makeChange(
                `${prefix}periodsAfter`,
                e.target.value,
                index,
                compareVar,
              )
            }
          />
        </>
      );
      break;
    default:
      input = null;
      break;
  }
  return input;
};
