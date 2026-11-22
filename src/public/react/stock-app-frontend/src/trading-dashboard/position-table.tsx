import { Dropdown } from "primereact/dropdown";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { MultiSelect } from "primereact/multiselect";
import { InputText } from "primereact/inputtext";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "primereact/button";
import { InputNumber } from "primereact/inputnumber";
import { Dialog } from "primereact/dialog";
import { Toast } from "primereact/toast";
import { useRef } from "react";
import { confirmDialog } from "primereact/confirmdialog";

import { IPosition } from "../shared/trading-types";
import { IDropDownItem } from "../shared/types";
import {
  IBatchQuoteResponse,
  StockAppAPI,
} from "../shared/utilities/stock-app-api";
import React from "react";

type GainDisplayMode = "dollar" | "percent";

type PositionTableRow = IPosition & {
  __daySort: number;
  __totalSort: number;
  __priceSort: number;
};

export function PositionTable({
  selectedAccount,
  positions,
  selectedPositions,
  setSelectedPositions,
  refreshPositions,
}: {
  selectedAccount: IDropDownItem;
  positions: IPosition[];
  selectedPositions: IPosition[];
  setSelectedPositions: (positions: IPosition[]) => void;
  refreshPositions: () => Promise<void>;
}) {
  const toast = useRef<Toast>(null);
  const [dayDisplayMode, setDayDisplayMode] = useState<GainDisplayMode>("dollar");
  const [totalDisplayMode, setTotalDisplayMode] = useState<GainDisplayMode>("dollar");
  const [quotes, setQuotes] = useState<IBatchQuoteResponse>({});
  const [quoteRefreshToken, setQuoteRefreshToken] = useState(0);
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);

  // Track edited values for each row
  const [editedValues, setEditedValues] = useState<Record<string, Partial<IPosition>>>({});

  const [ruleDialogVisible, setRuleDialogVisible] = useState(false);
  const [positionToEdit, setPositionToEdit] = useState<IPosition | null>(null);

  const [categories] = useState([
    { label: "Gold", value: "gold" },
    { label: "Silver", value: "silver" },
    { label: "Uranium", value: "uranium" },
    { label: "Oil", value: "oil" },
    { label: "Tech", value: "tech" },
    { label: "Natural Gas", value: "ng" },
    { label: "ETF", value: "etf" },
    { label: "Energy", value: "oil,ng,coal,uranium" },
  ]);

  const [assetTypes] = useState([
    { label: "Option", value: "OPTION" },
    { label: "Equity", value: "EQUITY" },
  ]);

  const quoteSymbols = useMemo(
    () => Array.from(new Set(
      positions
        .map((position) => position.instrument?.symbol?.trim())
        .filter((symbol): symbol is string => Boolean(symbol)),
    )),
    [positions],
  );

  // Check if position is an option
  const isOption = (position: IPosition): boolean => {
    return position.instrument?.assetType === "OPTION";
  };

  const formatThreshold = (value: unknown): string => {
    if (value == null || value === "") {
      return "-";
    }

    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "-";
  };

  const formatSignedCurrency = (value: number | null | undefined): string => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }

    const sign = value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };

  const formatSignedPercentage = (value: number | null | undefined): string => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }

    const sign = value < 0 ? "-" : "";
    return `${sign}${Math.abs(value).toFixed(2)}%`;
  };

  const getValueColor = (value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
      return undefined;
    }
    return value > 0 ? "green" : "red";
  };

  const getTotalGainPercentage = (rowData: IPosition) => {
    const denominator = rowData.marketValue - rowData.longOpenProfitLoss;
    if (!Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return 100 * (rowData.longOpenProfitLoss / denominator);
  };

  const getDaySortValue = (rowData: IPosition) => (
    dayDisplayMode === "dollar"
      ? rowData.currentDayProfitLoss
      : rowData.currentDayProfitLossPercentage
  );

  const getTotalSortValue = (rowData: IPosition) => (
    totalDisplayMode === "dollar"
      ? rowData.longOpenProfitLoss
      : getTotalGainPercentage(rowData)
  );

  const toSortableValue = (value: number | null | undefined) => (
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.NEGATIVE_INFINITY
  );

  const normalizeSymbolKey = (value: string) => value.replace(/ /g, "").toUpperCase();

  const getQuoteForPosition = (rowData: IPosition) => (
    quotes[normalizeSymbolKey(rowData.instrument?.symbol?.trim() ?? "")]
  );

  const tableRows = useMemo<PositionTableRow[]>(() => (
    positions.map((position) => ({
      ...position,
      __daySort: toSortableValue(
        dayDisplayMode === "dollar"
          ? position.currentDayProfitLoss
          : position.currentDayProfitLossPercentage,
      ),
      __totalSort: toSortableValue(
        totalDisplayMode === "dollar"
          ? position.longOpenProfitLoss
          : getTotalGainPercentage(position),
      ),
      __priceSort: toSortableValue(getQuoteForPosition(position)?.lastPrice),
    }))
  ), [positions, dayDisplayMode, totalDisplayMode, quotes]);

  const refreshQuotes = useCallback(async () => {
    if (quoteSymbols.length === 0) {
      setQuotes({});
      return;
    }

    setIsRefreshingQuotes(true);
    try {
      const data = await StockAppAPI.getStockPrices(quoteSymbols);
      const normalizedQuotes = Object.entries(data).reduce<IBatchQuoteResponse>((acc, [key, item]) => {
        const normalizedRequestedSymbol = normalizeSymbolKey(item?.requestedSymbol || key);
        acc[normalizedRequestedSymbol] = item;
        return acc;
      }, {});

      setQuotes(normalizedQuotes);
      setQuoteRefreshToken((prev) => prev + 1);
    } catch (err) {
      console.error("Error refreshing quotes:", err);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Failed to refresh quotes",
        life: 3000,
      });
    } finally {
      setIsRefreshingQuotes(false);
    }
  }, [quoteSymbols]);

  useEffect(() => {
    void refreshQuotes();

    if (quoteSymbols.length === 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshQuotes();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [quoteSymbols.length, refreshQuotes]);

  // Start editing a row
  const startEdit = useCallback((position: IPosition) => {
    const symbolKey = position.instrument?.symbol || "unknown";
    setPositionToEdit(position);
    setEditedValues(prev => ({
      ...prev,
      [symbolKey]: {
        stopLoss: position.stopLoss,
        stopLossOnUnderlying: position.stopLossOnUnderlying,
        target: position.target,
        targetOnUnderlying: position.targetOnUnderlying,
      },
    }));
    setRuleDialogVisible(true);
  }, []);

  const closeRuleDialog = useCallback(() => {
    setRuleDialogVisible(false);
    setPositionToEdit(null);
  }, []);

  // Save edited values to backend
  const saveEdit = useCallback(async (position: IPosition) => {
    try {
      const symbolKey = position.instrument?.symbol || "unknown";
      const edited = editedValues[symbolKey];

      await StockAppAPI.updatePositionRule(
        {
          symbol: position.instrument.symbol.replace(/ /g, ""),
          option: isOption(position) ? position.instrument.symbol : undefined,
          stopLoss: edited?.stopLoss,
          stopLossOnUnderlying: edited?.stopLossOnUnderlying,
          target: edited?.target,
          targetOnUnderlying: edited?.targetOnUnderlying,
        },
        selectedAccount.value,
      );

      await refreshPositions();
      setRuleDialogVisible(false);
      setPositionToEdit(null);

      toast.current?.show({
        severity: "success",
        summary: "Success",
        detail: "Position rule saved",
        life: 3000,
      });
    } catch (err) {
      console.error("Error saving position rule:", err);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Failed to save position rule",
        life: 3000,
      });
    }
  }, [editedValues, refreshPositions, selectedAccount]);

  // Delete a position rule
  const deleteRule = useCallback(async (position: IPosition) => {
    try {
      if (!position.positionRuleId) {
        toast.current?.show({
          severity: "warn",
          summary: "Warning",
          detail: "No rule to delete",
          life: 3000,
        });
        return;
      }

      await StockAppAPI.deletePositionRule(position.positionRuleId);

      await refreshPositions();

      toast.current?.show({
        severity: "success",
        summary: "Success",
        detail: "Position rule deleted",
        life: 3000,
      });
    } catch (err) {
      console.error("Error deleting position rule:", err);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Failed to delete position rule",
        life: 3000,
      });
    }
  }, [refreshPositions]);

  const confirmDeleteRule = useCallback((position: IPosition) => {
    const symbol = position.instrument?.symbol ?? "this position";
    confirmDialog({
      message: `Delete the position rule for ${symbol}?`,
      header: "Delete Position Rule",
      icon: "pi pi-exclamation-triangle",
      acceptClassName: "p-button-danger",
      accept: () => {
        deleteRule(position);
      },
    });
  }, [deleteRule]);

  const stockCategoryFilterTemplate = (options: {
    value: unknown;
    filterApplyCallback: (arg0: unknown) => void;
  }) => {
    return (
      <MultiSelect
        value={options.value || []}
        options={categories}
        itemTemplate={stockCategoryItemTemplate}
        onChange={(e) => options.filterApplyCallback(e.value ? e.value : "")}
        optionLabel="label"
        placeholder="Any"
        className="p-column-filter"
        maxSelectedLabels={1}
        style={{ minWidth: "14rem" }}
      />
    );
  };

  const stockCategoriesBodyTemplate = (rowData: IPosition) => {
    const category = rowData.labels;

    return (
      <div className="flex align-items-center gap-2">
        <span>{category}</span>
      </div>
    );
  };

  const stockCategoryItemTemplate = (option: { label: string }) => {
    return (
      <div className="flex align-items-center gap-2">
        <span>{option.label}</span>
      </div>
    );
  };

  const symbolFilterTemplate = (options: {
    value: string;
    filterApplyCallback: (arg0: string) => void;
  }) => {
    return (
      <InputText
        value={options.value}
        onChange={(e) => options.filterApplyCallback(e.target.value)}
        placeholder="Search symbol"
        className="p-column-filter"
        style={{ width: "100%", minWidth: "14rem" }}
      />
    );
  };

  const profitLossBody = (rowData: IPosition) => {
    const currentDayGain = getDaySortValue(rowData);
    return (
      <span style={{ color: getValueColor(currentDayGain) }}>
        {dayDisplayMode === "dollar"
          ? formatSignedCurrency(currentDayGain)
          : formatSignedPercentage(currentDayGain)}
      </span>
    );
  };

  const profitLossBody2 = (rowData: IPosition) => {
    const totalGain = getTotalSortValue(rowData);
    return (
      <span style={{ color: getValueColor(totalGain) }}>
        {totalDisplayMode === "dollar"
          ? formatSignedCurrency(totalGain)
          : formatSignedPercentage(totalGain)}
      </span>
    );
  };

  const descriptionBody = (rowData: IPosition) => (
    <span>{getQuoteForPosition(rowData)?.description || "-"}</span>
  );

  const priceBody = (rowData: IPosition) => (
    <span>{formatSignedCurrency(getQuoteForPosition(rowData)?.lastPrice)}</span>
  );

  const gainHeaderTemplate = (
    label: string,
    displayMode: GainDisplayMode,
    setDisplayMode: (mode: GainDisplayMode) => void,
  ) => {
    const stopHeaderInteraction = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleModeSelect = (
      event: React.MouseEvent<HTMLElement>,
      mode: GainDisplayMode,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setDisplayMode(mode);
    };

    return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span>{label}</span>
      <button
        type="button"
        onMouseDown={stopHeaderInteraction}
        onClick={(event) => {
          handleModeSelect(event, "dollar");
        }}
        style={{
          border: "none",
          background: "transparent",
          color: displayMode === "dollar" ? "inherit" : "#0d6efd",
          cursor: "pointer",
          padding: 0,
          textDecoration: displayMode === "dollar" ? "none" : "underline",
          fontWeight: displayMode === "dollar" ? 600 : 400,
        }}
      >
        $
      </button>
      <span>|</span>
      <button
        type="button"
        onMouseDown={stopHeaderInteraction}
        onClick={(event) => {
          handleModeSelect(event, "percent");
        }}
        style={{
          border: "none",
          background: "transparent",
          color: displayMode === "percent" ? "inherit" : "#0d6efd",
          cursor: "pointer",
          padding: 0,
          textDecoration: displayMode === "percent" ? "none" : "underline",
          fontWeight: displayMode === "percent" ? 600 : 400,
        }}
      >
        %
      </button>
    </div>
    );
  };

  const expirationDateBodyTemplate = (rowData: IPosition) => {
    if (!isOption(rowData) || !rowData.expireIsoDate) {
      return <span />;
    }

    const date = new Date(rowData.expireIsoDate);
    if (Number.isNaN(date.getTime())) {
      return <span />;
    }

    return <span>{date.toLocaleDateString()}</span>;
  };

  const assetTypeItemTemplate = (option: IDropDownItem) => {
    return <span>{option.label}</span>;
  };

  const assetTypeRowFilterTemplate = (options: {
    value: unknown;
    filterApplyCallback: (arg0: unknown) => void;
  }) => {
    return (
      <Dropdown
        value={options.value}
        options={assetTypes}
        onChange={(e) => options.filterApplyCallback(e.value)}
        placeholder="Select One"
        itemTemplate={assetTypeItemTemplate}
        className="p-column-filter"
        showClear
        style={{ minWidth: "12rem" }}
      />
    );
  };

  // Render stop loss cell (edit mode) - memoized
  const stopLossEditTemplate = useMemo(
    () => (rowData: IPosition) => (
      <span>{formatThreshold(rowData.stopLoss)}</span>
    ),
    [],
  );

  // Render stop loss on underlying cell (edit mode)
  const stopLossUnderlyingEditTemplate = (rowData: IPosition) => (
    <span>
      {isOption(rowData)
        ? formatThreshold(rowData.stopLossOnUnderlying)
        : "-"}
    </span>
  );

  // Render target cell (edit mode)
  const targetEditTemplate = (rowData: IPosition) => (
    <span>{formatThreshold(rowData.target)}</span>
  );

  // Render target on underlying cell (edit mode)
  const targetUnderlyingEditTemplate = (rowData: IPosition) => (
    <span>
      {isOption(rowData)
        ? formatThreshold(rowData.targetOnUnderlying)
        : "-"}
    </span>
  );

  // Render action buttons - memoized  
  const actionTemplate = useMemo(() => (rowData: IPosition) => {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          icon="pi pi-pencil"
          className="p-button-rounded p-button-info p-button-sm"
          tooltip="Edit position rule"
          tooltipOptions={{ position: "top" }}
          onClick={() => startEdit(rowData)}
        />
        {rowData.positionRuleId && (
          <Button
            icon="pi pi-trash"
            className="p-button-rounded p-button-danger p-button-sm"
            tooltip="Delete position rule"
            tooltipOptions={{ position: "top" }}
            onClick={() => confirmDeleteRule(rowData)}
          />
        )}
      </div>
    );
  }, [startEdit, confirmDeleteRule]);

  const onSelectionChange = (e: { value: IPosition[] }) => {
    setSelectedPositions(e.value);
  };

  return (
    <div className="p-4">
      <Toast ref={toast} />

      <div className="flex justify-content-end mb-2">
        <Button
          icon="pi pi-refresh"
          className="p-button-text p-button-sm"
          tooltip="Refresh quotes"
          tooltipOptions={{ position: "top" }}
          loading={isRefreshingQuotes}
          onClick={() => {
            void refreshQuotes();
          }}
        />
      </div>

      {/* DataTable */}
      <DataTable
        key={`positions-table-${dayDisplayMode}-${totalDisplayMode}-${quoteRefreshToken}`}
        className="positions-table"
        rowHover
        stripedRows
        scrollable
        scrollHeight="calc(100vh - 300px)"
        value={tableRows}
        dataKey="instrument.symbol"
        selectionMode="multiple"
        selection={selectedPositions}
        onSelectionChange={onSelectionChange}
        filterDisplay="row"
        responsiveLayout="scroll"
        emptyMessage="No positions found. Time to buy something!"
      >
        <Column selectionMode="multiple" headerStyle={{ width: "3rem" }} />
        <Column
          showFilterMatchModes={false}
          filter
          field="instrument.symbol"
          filterElement={symbolFilterTemplate}
          header="Symbol"
          style={{ minWidth: "14rem" }}
        />
        <Column
          key={`description-${quoteRefreshToken}`}
          header="Description"
          body={descriptionBody}
          style={{ minWidth: "16rem" }}
        />
        <Column field="longQuantity" header="Qty" />
        <Column
          key={`price-${quoteRefreshToken}`}
          field="__priceSort"
          header="Price"
          body={priceBody}
          sortable
        />
        <Column
          field="marketValue"
          sortable
          header="Market Value"
          body={(row) => `$${row.marketValue.toFixed(2)}`}
        />
        <Column
          key={`day-${dayDisplayMode}`}
          field="__daySort"
          body={profitLossBody}
          header={gainHeaderTemplate("Day ±", dayDisplayMode, setDayDisplayMode)}
          sortable
        />
        <Column
          key={`total-${totalDisplayMode}`}
          field="__totalSort"
          body={profitLossBody2}
          header={gainHeaderTemplate("Total ±", totalDisplayMode, setTotalDisplayMode)}
          sortable
        />
        <Column
          field="instrument.assetType"
          filter
          filterElement={assetTypeRowFilterTemplate}
          header="Type"
        />
        <Column body={expirationDateBodyTemplate} header="Option Expiration Date" />
        <Column
          header="Labels"
          filter
          filterElement={stockCategoryFilterTemplate}
          body={stockCategoriesBodyTemplate}
        />

        {/* 🆕 Stop Loss Column */}
        <Column header="Stop Loss" body={stopLossEditTemplate} style={{ minWidth: "120px" }} />

        {/* 🆕 Stop Loss (Underlying) Column - only visible for options */}
        <Column
          header="Stop Loss (Under.)"
          body={stopLossUnderlyingEditTemplate}
          style={{ minWidth: "140px" }}
        />

        {/* 🆕 Target Column */}
        <Column header="Target" body={targetEditTemplate} style={{ minWidth: "120px" }} />

        {/* 🆕 Target (Underlying) Column - only visible for options */}
        <Column
          header="Target (Under.)"
          body={targetUnderlyingEditTemplate}
          style={{ minWidth: "140px" }}
        />

        {/* 🆕 Actions Column */}
        <Column header="Actions" body={actionTemplate} style={{ minWidth: "100px" }} />
      </DataTable>

      <Dialog
        header={positionToEdit ? `Edit ${positionToEdit.instrument.symbol}` : "Edit position rule"}
        visible={ruleDialogVisible}
        style={{ width: "34rem" }}
        modal
        onHide={closeRuleDialog}
      >
        {positionToEdit && (
          <div className="flex flex-column gap-3">
            <div>
              <label className="block mb-2">Stop Loss</label>
              <InputNumber
                value={editedValues[positionToEdit.instrument.symbol]?.stopLoss ?? null}
                onValueChange={(e) => {
                  setEditedValues((prev) => ({
                    ...prev,
                    [positionToEdit.instrument.symbol]: {
                      ...(prev[positionToEdit.instrument.symbol] || {}),
                      stopLoss: e.value ?? undefined,
                    },
                  }));
                }}
                mode="currency"
                currency="USD"
                locale="en-US"
                className="w-full"
                placeholder="Enter stop loss"
              />
            </div>

            {isOption(positionToEdit) && (
              <div>
                <label className="block mb-2">Stop Loss on Underlying</label>
                <InputNumber
                  value={editedValues[positionToEdit.instrument.symbol]?.stopLossOnUnderlying ?? null}
                  onValueChange={(e) => {
                    setEditedValues((prev) => ({
                      ...prev,
                      [positionToEdit.instrument.symbol]: {
                        ...(prev[positionToEdit.instrument.symbol] || {}),
                        stopLossOnUnderlying: e.value ?? undefined,
                      },
                    }));
                  }}
                  mode="currency"
                  currency="USD"
                  locale="en-US"
                  className="w-full"
                  placeholder="Enter stop loss on underlying"
                />
              </div>
            )}

            <div>
              <label className="block mb-2">Target</label>
              <InputNumber
                value={editedValues[positionToEdit.instrument.symbol]?.target ?? null}
                onValueChange={(e) => {
                  setEditedValues((prev) => ({
                    ...prev,
                    [positionToEdit.instrument.symbol]: {
                      ...(prev[positionToEdit.instrument.symbol] || {}),
                      target: e.value ?? undefined,
                    },
                  }));
                }}
                mode="currency"
                currency="USD"
                locale="en-US"
                className="w-full"
                placeholder="Enter target"
              />
            </div>

            {isOption(positionToEdit) && (
              <div>
                <label className="block mb-2">Target on Underlying</label>
                <InputNumber
                  value={editedValues[positionToEdit.instrument.symbol]?.targetOnUnderlying ?? null}
                  onValueChange={(e) => {
                    setEditedValues((prev) => ({
                      ...prev,
                      [positionToEdit.instrument.symbol]: {
                        ...(prev[positionToEdit.instrument.symbol] || {}),
                        targetOnUnderlying: e.value ?? undefined,
                      },
                    }));
                  }}
                  mode="currency"
                  currency="USD"
                  locale="en-US"
                  className="w-full"
                  placeholder="Enter target on underlying"
                />
              </div>
            )}

            <div className="flex justify-content-end gap-2 mt-2">
              <Button label="Cancel" severity="secondary" outlined onClick={closeRuleDialog} />
              <Button
                label="Save"
                onClick={() => {
                  if (positionToEdit) {
                    saveEdit(positionToEdit);
                  }
                }}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
