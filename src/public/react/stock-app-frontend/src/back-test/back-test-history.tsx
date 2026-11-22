import * as React from "react";
import { useEffect, useState, ChangeEvent } from "react";
import { Button } from "primereact/button";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { InputText } from "primereact/inputtext";
import { FilterMatchMode, FilterOperator } from "primereact/api";
import { NameIdPair, IBacktestResultRow } from "../shared/types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import "./back-test-page.scss";

function formatDate(time: number) {
  return new Date(time).toLocaleString();
}

interface IBacktestResultRowView extends IBacktestResultRow {
  avgTradeGainLoss: number | null;
}

export default function BackTestHistoryPage() {
  const [strategiesSelected, setStrategiesSelected] = useState<NameIdPair[]>(
    [],
  );
  const [group, setGroup] = useState<NameIdPair>({ name: "", id: 0 });
  const [strategies, setStrategies] = useState<NameIdPair[]>([]);
  const [groups, setGroups] = useState<NameIdPair[]>([]);
  const [filteredStrategies, setFilteredStrategies] = useState<NameIdPair[]>(
    [],
  );
  const [filteredGroups, setFilteredGroups] = useState<NameIdPair[]>([]);
  const [results, setResults] = useState<IBacktestResultRowView[]>([]);
  const [error, setError] = useState("");
  const [globalFilterValue, setGlobalFilterValue] = useState<string>("");
  const [filters, setFilters] = useState({
    global: { value: "", matchMode: FilterMatchMode.CONTAINS },
    strategyName: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }],
    },
    startTime: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    endTime: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    returnPct: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    trades: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
    avgTradeGainLoss: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
    },
  });

  useEffect(() => {
    StockAppAPI.getAllStrategyNames().then((resp) => setStrategies(resp));
    StockAppAPI.getAllStockGroupNames().then((resp) => setGroups(resp));
  }, []);

  const initFilters = () => {
    setFilters({
      global: { value: "", matchMode: FilterMatchMode.CONTAINS },
      strategyName: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }],
      },
      startTime: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      endTime: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      returnPct: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      trades: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
      avgTradeGainLoss: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }],
      },
    });
    setGlobalFilterValue("");
  };

  const onGlobalFilterChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const copy = { ...filters };
    copy.global = { ...copy.global, value };
    setFilters(copy);
    setGlobalFilterValue(value);
  };

  const searchStrategies = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const filtered = strategies.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredStrategies(filtered);
    }, 250);
  };

  const searchGroups = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const filtered = groups.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredGroups(filtered);
    }, 250);
  };

  const onChangeStrategy = (event: AutoCompleteChangeEvent) => {
    setStrategiesSelected(event.value || []);
  };

  const onChangeGroup = (event: AutoCompleteChangeEvent) => {
    setGroup(event.value);
  };

  const onSubmit = () => {
    if (!group?.id) {
      setError("Stock group is required");
      return;
    }

    setError("");
    const selectedStrategyIds = strategiesSelected
      .map((strategy) => strategy.id)
      .filter(Boolean);
    StockAppAPI.getBacktestResults(group.id, selectedStrategyIds)
      .then((data) => {
        const rows: IBacktestResultRowView[] = data.map(
          (item: IBacktestResultRow) => {
            const trades = item.trades != null ? Number(item.trades) : 0;
            const returnPct = item.returnPct != null ? Number(item.returnPct) : null;
            return {
              ...item,
              trades,
              returnPct,
              avgTradeGainLoss:
                returnPct !== null && trades > 0 ? returnPct / trades : null,
            };
          },
        );
        setResults(rows);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "Failed to load results");
      });
  };

  const onClear = () => {
    setStrategiesSelected([]);
    setGroup({ name: "", id: 0 });
    setResults([]);
    setError("");
    initFilters();
  };

  const dateBodyTemplate = (
    rowData: IBacktestResultRowView,
    field: "startTime" | "endTime",
  ) => {
    return formatDate(rowData[field]);
  };

  const gainPercentTemplate = (rowData: IBacktestResultRowView) => {
    return typeof rowData.returnPct === "number"
      ? `${rowData.returnPct.toFixed(2)}%`
      : "";
  };

  const avgTradeGainLossTemplate = (rowData: IBacktestResultRowView) => {
    return typeof rowData.avgTradeGainLoss === "number"
      ? `${rowData.avgTradeGainLoss.toFixed(2)}%`
      : "";
  };

  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Button
        type="button"
        icon="pi pi-filter-slash"
        label="Clear"
        className="p-button-outlined"
        onClick={initFilters}
      />
      <span className="p-input-icon-left">
        <i className="pi pi-search" />
        <InputText
          value={globalFilterValue}
          onChange={onGlobalFilterChange}
          placeholder="Keyword Search"
        />
      </span>
    </div>
  );

  return (
    <div className="backtest-container">
      <h2>Back tests by stock group</h2>

      <div className="form-section">
        <AutoComplete
          field="name"
          multiple
          completeMethod={searchStrategies}
          suggestions={filteredStrategies}
          placeholder="Optional Strategy Names (multi-select)"
          value={strategiesSelected}
          onChange={onChangeStrategy}
        />

        <AutoComplete
          field="name"
          completeMethod={searchGroups}
          suggestions={filteredGroups}
          placeholder="Stock Group Name (required)"
          value={group}
          onChange={onChangeGroup}
          className={!group?.id ? "invalid" : ""}
        />

        {error && <p className="error">{error}</p>}

        <div className="button-row">
          <Button label="Submit" onClick={onSubmit} />
          <Button
            label="Clear"
            className="p-button-secondary"
            onClick={onClear}
          />
        </div>
      </div>

      <div className="results">
        <DataTable<IBacktestResultRowView[]>
          value={results}
          filters={filters}
          globalFilterFields={[
            "strategyName",
            "startTime",
            "endTime",
            "returnPct",
            "trades",
            "avgTradeGainLoss",
          ]}
          filterDisplay="menu"
          responsiveLayout="scroll"
          paginator
          paginatorTemplate="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
          currentPageReportTemplate="Showing {first} to {last} of {totalRecords}"
          rows={10}
          rowsPerPageOptions={[10, 20, 50]}
          header={header}
          emptyMessage="No back test results found."
          className="shadow-sm rounded-md"
        >
          <Column
            field="strategyName"
            header="Strategy Name"
            sortable
            filter
            filterPlaceholder="Search by strategy"
          />
          <Column
            field="startTime"
            header="Start Date"
            body={(rowData) => dateBodyTemplate(rowData, "startTime")}
            sortable
            filter
            filterPlaceholder="Search by start date"
          />
          <Column
            field="endTime"
            header="End Date"
            body={(rowData) => dateBodyTemplate(rowData, "endTime")}
            sortable
            filter
            filterPlaceholder="Search by end date"
          />
          <Column
            field="returnPct"
            header="Gain Percent"
            body={gainPercentTemplate}
            sortable
            filter
            filterPlaceholder="Search by gain"
          />
          <Column
            field="trades"
            header="Number of Trades"
            sortable
            filter
            filterPlaceholder="Search by trades"
          />
          <Column
            field="avgTradeGainLoss"
            header="Avg Trade Gain/Loss"
            body={avgTradeGainLossTemplate}
            sortable
            filter
            filterPlaceholder="Search by avg trade"
          />
        </DataTable>
      </div>
    </div>
  );
}
