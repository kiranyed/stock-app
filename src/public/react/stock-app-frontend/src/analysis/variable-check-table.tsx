import React from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { IVariableCheckRow } from "../shared/types";

interface IProps {
  rows: IVariableCheckRow[];
  variables: string[];
}

function createVariableValueRenderer(variable: string) {
  return (rowData: IVariableCheckRow) => {
    const rawValue = rowData[variable];

    if (typeof rawValue !== "number") {
      return rawValue;
    }

    if (!Number.isFinite(rawValue)) {
      return "-";
    }

    const rounded = rawValue.toFixed(2);
    const className =
      rawValue > 0
        ? "variable-check-positive"
        : rawValue < 0
          ? "variable-check-negative"
          : undefined;

    return <span className={className}>{rounded}</span>;
  };
}

export function VariableCheckTable({ rows, variables }: IProps) {
  const bodyRenderers = React.useMemo(() => {
    return variables.reduce<Record<string, (rowData: IVariableCheckRow) => React.ReactNode>>(
      (acc, variable) => {
        acc[variable] = createVariableValueRenderer(variable);
        return acc;
      },
      {},
    );
  }, [variables]);

  return (
    <div hidden={rows.length === 0}>
      <DataTable
        value={rows}
        responsiveLayout="scroll"
        dataKey="symbol"
        scrollable
        scrollHeight="28rem"
        virtualScrollerOptions={{ itemSize: 40 }}
      >
        <Column field={"symbol"} header={"Symbol"} sortable></Column>
        {variables.map((variable) => (
          <Column
            key={variable}
            field={variable}
            header={variable}
            body={bodyRenderers[variable]}
            sortable
          ></Column>
        ))}
      </DataTable>
    </div>
  );
}
