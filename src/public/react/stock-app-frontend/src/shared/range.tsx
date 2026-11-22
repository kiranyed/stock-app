import { Calendar } from "primereact/calendar";
import { FormEvent, Nullable } from "primereact/ts-helpers";
import * as React from "react";

interface IProps {
  startDate: Nullable<Date>;
  endDate: Nullable<Date>;
  setStartDate: (
    d: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => void;
  setEndDate: (
    d: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => void;
}

export function Range(props: IProps) {
  return (
    <div className="range">
      <div className="date-field">
        <label>Start Date</label>
        <Calendar
          showIcon
          value={props.startDate}
          onChange={props.setStartDate}
          dateFormat="yy-mm-dd"
        />
      </div>

      <div className="date-field">
        <label>End Date</label>
        <Calendar
          showIcon
          value={props.endDate}
          onChange={props.setEndDate}
          dateFormat="yy-mm-dd"
        />
      </div>
    </div>
  );
}
