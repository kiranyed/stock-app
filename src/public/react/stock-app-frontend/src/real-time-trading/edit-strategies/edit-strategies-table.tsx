// edit-strategies-table.tsx
import * as React from "react";
import { useState, useEffect, ChangeEvent } from "react";
import { Button } from "primereact/button";
import {
  DataTable,
  DataTableRowEditCompleteEvent,
  DataTableSelectionMultipleChangeEvent,
} from "primereact/datatable";
import { Column } from "primereact/column";
import { InputText } from "primereact/inputtext";
import { Dialog } from "primereact/dialog";
import { FilterMatchMode, FilterOperator } from "primereact/api";
import { IStrategy, IStrategyWithIndex } from "../../shared/types";
import { InitUtil } from "../../shared/utilities/init-util";

interface IProps {
  selection: IStrategy[];
  value: IStrategy[];
  onRowEditComplete: (e: DataTableRowEditCompleteEvent) => void;
  onSelectionChange: (
    e: DataTableSelectionMultipleChangeEvent<IStrategy[]>,
  ) => void;
  editStrategy: (rowData: IStrategy, column: { rowIndex: number }) => void;
  confirmDeleteStrategy: (rowData: IStrategyWithIndex) => void;
  duplicateStrategy: (strategyId: number, newName: string) => void;
}

export function EditStrategiesTable(props: IProps) {
  const [globalFilterValue, setGlobalFilterValue] = useState<string>("");
  const [filters, setFilters] = useState({
    global: { value: "", matchMode: FilterMatchMode.CONTAINS },
    name: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }],
    },
  });
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [duplicateDialogVisible, setDuplicateDialogVisible] = useState(false);
  const [strategyToDuplicate, setStrategyToDuplicate] =
    useState<IStrategy | null>(null);
  const [newStrategyName, setNewStrategyName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    initFilters();
  }, []);

  const initFilters = () => {
    setFilters({
      global: { value: "", matchMode: FilterMatchMode.CONTAINS },
      name: {
        operator: FilterOperator.AND,
        constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }],
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

  const openDuplicateDialog = (strategy: IStrategy) => {
    setStrategyToDuplicate(strategy);
    setNewStrategyName("");
    setErrorMessage("");
    setDuplicateDialogVisible(true);
  };

  const closeDuplicateDialog = () => {
    setDuplicateDialogVisible(false);
    setStrategyToDuplicate(null);
    setNewStrategyName("");
    setErrorMessage("");
  };

  const handleDuplicateOk = () => {
    if (!newStrategyName.trim()) {
      setErrorMessage("This is a required field");
      return;
    }

    if (strategyToDuplicate) {
      props.duplicateStrategy(strategyToDuplicate.id, newStrategyName.trim());
      closeDuplicateDialog();
    }
  };

  const strategyTemplate = (rowData: IStrategy) => {
    const str = convertStrategyToString(rowData);
    return (
      <div>
        {str.map((item, idx) =>
          item.includes("Screener") ? (
            <div key={idx} style={{ fontWeight: 700, marginTop: 8 }}>
              {item}
            </div>
          ) : (
            <div key={idx} style={{ color: "#555", fontSize: 13 }}>
              {item}
            </div>
          ),
        )}
      </div>
    );
  };

  const convertStrategyToString = (obj: IStrategy) => {
    const screeners = obj.screeners || [];
    const str: string[] = [];
    for (let i = 0; i < screeners.length; i++) {
      str.push("Screener " + (i + 1) + ":");
      const screener = screeners[i];
      if (
        screener.buySellFilters &&
        InitUtil.isNotEmpty(screener.buySellFilters)
      ) {
        str.push(
          "Buy: " +
            InitUtil.convertFilterGroupToString(screener.buySellFilters.enter),
        );
        str.push(
          "Sell: " +
            InitUtil.convertFilterGroupToString(screener.buySellFilters.exit),
        );
      }
      if (
        screener.shortCoverFilters &&
        InitUtil.isNotEmpty(screener.shortCoverFilters)
      ) {
        str.push(
          "Short: " +
            InitUtil.convertFilterGroupToString(
              screener.shortCoverFilters.enter,
            ),
        );
        str.push(
          "Cover: " +
            InitUtil.convertFilterGroupToString(
              screener.shortCoverFilters.exit,
            ),
        );
      }
    }
    return str;
  };

  const periodTemplate = (rowData: IStrategy) => (
    <span
      style={{
        background: "#eef6ff",
        color: "#0b66c3",
        padding: "4px 8px",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {rowData.period} min
    </span>
  );

  const actionBodyTemplate = (
    rowData: IStrategyWithIndex,
    column: { rowIndex: number },
  ) => (
    <div style={{ display: "flex", gap: 8 }}>
      <Button
        icon="pi pi-pencil"
        className="p-button-rounded p-button-success p-button-sm"
        onClick={() => props.editStrategy(rowData as IStrategy, column)}
      />
      <Button
        icon="pi pi-copy"
        className="p-button-rounded p-button-info p-button-sm"
        onClick={() => openDuplicateDialog(rowData as IStrategy)}
      />
      <Button
        icon="pi pi-trash"
        className="p-button-rounded p-button-danger p-button-sm"
        onClick={() => props.confirmDeleteStrategy(rowData)}
      />
    </div>
  );

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
    <>
      <Dialog
        visible={duplicateDialogVisible}
        onHide={closeDuplicateDialog}
        header={`Duplicate strategy ${strategyToDuplicate?.name}`}
        modal
        style={{ width: "50vw" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontWeight: 500 }}>
              Name of the new duplicated strategy{" "}
              <span style={{ color: "red" }}>*</span>
            </label>
            <InputText
              value={newStrategyName}
              onChange={(e) => {
                setNewStrategyName(e.target.value);
                setErrorMessage("");
              }}
              placeholder="Enter strategy name"
              onKeyPress={(e) => e.key === "Enter" && handleDuplicateOk()}
            />
            {errorMessage && (
              <div style={{ color: "red", fontSize: 12 }}>{errorMessage}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={closeDuplicateDialog}
              className="p-button-outlined"
            />
            <Button label="OK" icon="pi pi-check" onClick={handleDuplicateOk} />
          </div>
        </div>
      </Dialog>
      <DataTable<IStrategy[]>
        value={props.value}
        selection={props.selection}
        onSelectionChange={props.onSelectionChange}
        filters={filters}
        globalFilterFields={["name", "description"]}
        filterDisplay="menu"
        editMode="row"
        dataKey="id"
        onRowEditComplete={props.onRowEditComplete}
        editingRows={editingRows}
        onRowEditChange={(e) => setEditingRows(e.data ?? {})}
        responsiveLayout="scroll"
        paginator
        paginatorTemplate="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
        currentPageReportTemplate="Showing {first} to {last} of {totalRecords}"
        rows={10}
        rowsPerPageOptions={[10, 20, 50]}
        header={header}
        emptyMessage="No strategies found."
        selectionMode="multiple"
        className="shadow-sm rounded-md"
      >
        <Column selectionMode="multiple" headerStyle={{ width: "3rem" }} />
        <Column
          field="name"
          header="Name"
          sortable
          filter
          filterPlaceholder="Search by name"
        />
        <Column body={strategyTemplate} header="Strategy" />
        <Column field="description" header="Description" />
        <Column field="date_added" header="Date of creation" sortable />
        <Column field="period" body={periodTemplate} header="Period" sortable />
        <Column
          body={actionBodyTemplate}
          header="Actions"
          style={{ width: "8rem" }}
        />
      </DataTable>
    </>
  );
}
