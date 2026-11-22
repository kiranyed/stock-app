import React from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { InitUtil } from "../shared/utilities/init-util";
import { IAnalysisData, IFilter } from "../shared/types";

interface IProps {
  data: IAnalysisData[];
  filters: IFilter[];
  dataFilters: IFilter[];
}

function timeTemplate(rowData: IAnalysisData) {
  return (
    <label>
      {new Date(rowData.time).toString()} {rowData["time"]}
    </label>
  );
}

export function AnalysisDataTable(props: IProps) {
  const { data, filters, dataFilters } = props;
  return (
    <div hidden={data && data.length === 0}>
      {/* combine the scenario filters and data filters arrays, convert to string, list it out as <th> elements */}

      {/* 2-d array of values.  each row will correspond to a particular time where the scenario was hit,
                            and the entries in the row will be the values of the scenario and requested data filters */}
      <DataTable value={data} responsiveLayout="scroll">
        <Column field={"symbol"} header={"Symbol"}></Column>
        <Column
          body={timeTemplate}
          field={"time"}
          sortable
          header={"Time"}
        ></Column>
        {filters.map((filt, idx) => (
          <Column
            key={idx}
            sortable
            field={InitUtil.convertToVariableName(filt)}
            header={InitUtil.convertFilterVarNameToString(filt.varName)}
          ></Column>
        ))}
        {dataFilters.map((filt, idx) => (
          <Column
            key={idx}
            sortable
            field={InitUtil.convertToVariableName(filt)}
            header={InitUtil.convertFilterVarNameToString(filt.varName)}
          ></Column>
        ))}
      </DataTable>
    </div>
  );
}
