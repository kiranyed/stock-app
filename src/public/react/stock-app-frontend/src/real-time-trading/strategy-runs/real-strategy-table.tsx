import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import React, { useState } from "react";
import { ITransaction } from "../../shared/types";
import { StockAppAPI } from "../../shared/utilities/stock-app-api";

interface IRealStrategyTableProps {
  removeRealStrategy: (id: number) => void;
  transactions: ITransaction[];
  strategyName: string;
  groupName: string;
  id: number;
}

export function RealStrategyTable(props: IRealStrategyTableProps) {
  const [paused, setPaused] = useState(false);
  const [terminated, setTerminate] = useState(false);
  const resume = () => {
    setPaused(false);
    StockAppAPI.resumeRealStrategy(props.id).then(() => setPaused(false));
  };

  const pause = () => {
    StockAppAPI.pauseRealStrategy(props.id).then(() => setPaused(true));
  };

  const terminate = () => {
    setTerminate(true);
    props.removeRealStrategy(props.id);
    StockAppAPI.endRealStrategy(props.id);
  };

  return (
    <React.Fragment>
      <div className="strategy-header">
        <h2>
          {props.strategyName}: {props.groupName}
        </h2>
        <div className="strategy-actions">
          {!terminated && (
            <Button
              icon={paused ? "pi pi-play" : "pi pi-pause"}
              onClick={paused ? resume : pause}
              className="strategy-action-btn"
              title={paused ? "Resume" : "Pause"}
              aria-label={paused ? "Resume strategy" : "Pause strategy"}
            />
          )}
          <Button
            icon="pi pi-stop"
            onClick={terminate}
            className="strategy-action-btn strategy-terminate-btn"
            title="Terminate"
            aria-label="Terminate strategy"
          />
        </div>
      </div>
      <DataTable
        value={props.transactions ?? []}
        responsiveLayout="scroll"
        emptyMessage="No transactions made yet."
      >
        <Column field="symbol" header="Symbol"></Column>
        <Column field="datetime" header="Datetime"></Column>
        <Column sortable field="netGain" header="Net gain"></Column>
        <Column
          sortable
          field="netPercentGain"
          header="Net gain percent"
        ></Column>
      </DataTable>
    </React.Fragment>
  );
}
