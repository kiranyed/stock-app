import { Button } from "primereact/button";
import * as React from "react";
import { IDropDownItem, IFilter } from "../shared/types";
import { Filter } from "../real-time-trading/filter-group/filter";

import "./analysis-filter-group.scss";

interface IProps {
  filters: IFilter[];
  callback: (filter: IFilter, index: number) => void;
  removeFilter: (index: number) => void;
  dataFilters?: boolean;
  /** Variables to offer; defaults to everything the engine computes */
  variableOptions?: IDropDownItem[];
}

export function AnalysisFilterGroup(props: IProps) {
  const makeChange = (name: string, val: string, index: number) => {
    const filters = [...props.filters];
    props.callback({ ...filters[index], [name]: val }, index);
  };

  return (
    <div className="filter-group-list">
      {props.filters.map((filter: IFilter, i: number) => (
        <div key={i} className="filter-card">
          <div className="filter-header">
            <span>Filter {i + 1}</span>
            <Button
              onClick={() => props.removeFilter(i)}
              className="trash"
              icon="pi pi-trash"
              tooltip="Remove"
              tooltipOptions={{ position: "top" }}
            />
          </div>
          <Filter
            filter={filter}
            type={""}
            editingGroup={false}
            index={i}
            dataFilter={Boolean(props.dataFilters)}
            makeChange={makeChange}
            variableOptions={props.variableOptions}
          />
        </div>
      ))}
    </div>
  );
}
