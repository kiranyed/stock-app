import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import React, { useState } from "react";
import { ITransaction } from "../../shared/types";
import { StockAppAPI } from "../../shared/utilities/stock-app-api";

interface ISimulationTableProps {
  removeSimulation: (id: number) => void;
  transactions: ITransaction[];
  strategyName: string;
  groupName: string;
  id: number;
}

export function SimulationTable(props: ISimulationTableProps) {
  const [paused, setPaused] = useState(false);

  const resume = () => {
    StockAppAPI.resumeSimulation(props.id).then(() => setPaused(false));
  };

  const pause = () => {
    StockAppAPI.pauseSimulation(props.id).then(() => setPaused(true));
  };

  const endRun = () => {
    StockAppAPI.endSimulation(props.id).then(() =>
      props.removeSimulation(props.id),
    );
  };

  return (
    <React.Fragment>
      <div className="strategy-header">
        <h2>
          {props.strategyName} : {props.groupName}
        </h2>
        <div className="strategy-actions">
          <Button
            icon={paused ? "pi pi-play" : "pi pi-pause"}
            onClick={paused ? resume : pause}
            className="strategy-action-btn"
            title={paused ? "Resume" : "Pause"}
            aria-label={paused ? "Resume" : "Pause"}
          />
          <Button
            icon="pi pi-stop"
            onClick={endRun}
            className="strategy-action-btn strategy-terminate-btn"
            title="Terminate"
            aria-label="Terminate"
          />
        </div>
      </div>
      <DataTable
        value={props.transactions}
        responsiveLayout="scroll"
        emptyMessage="No transactions made yet."
      >
        <Column field="symbol" header="Symbol"></Column>
        <Column field="datetime" header="Datetime"></Column>
        <Column sortable field="netGain" header="Net gain"></Column>
        <Column sortable field="netPercentGain" header="Net gain"></Column>
      </DataTable>
    </React.Fragment>
  );
}
