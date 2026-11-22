import * as React from "react";
import { Button } from "primereact/button";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import { AnalysisFilterGroup } from "./analysis-filter-group";
import {
  IFilter,
  NameIdPair,
  IVariableCheckResponse,
  IVariableDefinition,
} from "../shared/types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { InitUtil } from "../shared/utilities/init-util";
import { VariableCheckTable } from "./variable-check-table";
import "./analysis.scss";

const VariableCheckPage: React.FC = () => {
  const [variables, setVariables] = React.useState<IFilter[]>([]);
  const [group, setGroup] = React.useState<NameIdPair>({ name: "", id: 0 });
  const [allGroups, setAllGroups] = React.useState<NameIdPair[]>([]);
  const [filteredNameIdPairs, setFilteredNameIdPairs] = React.useState<
    NameIdPair[]
  >([]);
  const [rows, setRows] = React.useState<IVariableCheckResponse["rows"]>([]);
  const [resolvedVariables, setResolvedVariables] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    StockAppAPI.getAllStockGroupNames().then((resp) => {
      setAllGroups(resp);
    });
  }, []);

  const changeVariable = (newVariable: IFilter, index: number) => {
    setVariables((prev) =>
      prev.map((filter, i) => (i === index ? newVariable : filter)),
    );
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => [
      ...prev.slice(0, index),
      ...prev.slice(index + 1),
    ]);
  };

  const addVariable = () => {
    setVariables((prev) => [...prev, InitUtil.initFilter()]);
  };

  const searchGroups = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = allGroups.filter((stockGroup) =>
        stockGroup.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredNameIdPairs(results);
    }, 250);
  };

  const changeGroupName = (event: AutoCompleteChangeEvent) => {
    setGroup(event.target.value);
  };

  const runVariableCheck = async () => {
    if (!group.id || variables.length === 0) {
      setError("Please select a stock group and add at least one variable.");
      return;
    }

    const variablePayload: IVariableDefinition[] = variables.map((variable) => {
      const { operator, compareVal, ...rest } = variable;
      void operator;
      void compareVal;
      return rest;
    });

    try {
      const response = await StockAppAPI.checkVariables(variablePayload, group.id);
      setRows(response.rows || []);
      setResolvedVariables(response.variables || []);
      setError("");
    } catch (err: unknown) {
      const maybeMessage =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message === "string"
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : undefined;
      const errorMessage = maybeMessage ?? "Failed to run variable check";
      setError(errorMessage);
    }
  };

  return (
    <div className="analysis-container">
      <h2>Day Variable Check</h2>
      <div className="form-section">
        <label>Stock Group Name</label>
        <AutoComplete
          field="name"
          forceSelection
          completeMethod={searchGroups}
          suggestions={filteredNameIdPairs}
          placeholder="Stock Group Name"
          value={group}
          onChange={changeGroupName}
        />
      </div>

      <div className="form-section">
        <h3>Variables</h3>
        <AnalysisFilterGroup
          dataFilters={true}
          callback={changeVariable}
          removeFilter={removeVariable}
          filters={variables}
        />
        <Button
          label="Add variable"
          style={{ marginTop: "1rem" }}
          onClick={addVariable}
        />
      </div>

      {error && <div className="error">{error}</div>}

      <Button
        label="Check variables"
        className="primary-btn"
        style={{ marginTop: "2rem", marginBottom: "2rem" }}
        onClick={runVariableCheck}
      />

      <VariableCheckTable rows={rows} variables={resolvedVariables} />
    </div>
  );
};

export default VariableCheckPage;
