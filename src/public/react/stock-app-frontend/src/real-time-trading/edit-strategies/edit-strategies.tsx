import React, { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Toolbar } from "primereact/toolbar";
import { Toast } from "primereact/toast";
import "./edit-strategies.scss";
import StrategyDialog from "./strategy-dialog";
import DeleteDialog from "../../shared/delete-dialogs";
import DialogBody from "../../shared/dialog-body";
import { EditStrategiesTable } from "./edit-strategies-table";
import { IStrategy, IStrategyWithIndex } from "../../shared/types";
import { StockAppAPI } from "../../shared/utilities/stock-app-api";
import {
  displayErrorWithMessage,
  displaySuccess,
} from "../../shared/toast-util";
import {
  DataTableRowEditCompleteEvent,
  DataTableSelectionMultipleChangeEvent,
} from "primereact/datatable";

const EditStrategiesPageNew: React.FC = () => {
  const [strategy, setStrategy] = useState<IStrategy & { idx: number }>({
    idx: -1,
    id: -1,
    screeners: [],
    name: "",
    description: "",
    period: 0,
  });
  const [strategies, setStrategies] = useState<IStrategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<IStrategy[]>([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [deleteStrategyDialog, setDeleteStrategyDialog] = useState(false);
  const [deleteStrategiesDialog, setDeleteStrategiesDialog] = useState(false);

  const toast = useRef<Toast>(null);

  useEffect(() => {
    StockAppAPI.getAllStrategies()
      .then((strategies) => setStrategies(strategies))
      .catch(console.error);
  }, []);

  const emptyStrategy = (): IStrategy & { idx: number } => ({
    idx: -1,
    id: 0,
    period: 0,
    name: "",
    description: "",
    screeners: [],
  });

  const openDialog = () => {
    setStrategy(emptyStrategy());
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);
  const hideToast = () => toast.current?.clear();

  const onRowEditComplete = (e: DataTableRowEditCompleteEvent) => {
    const { newData, index } = e;
    const newStrategy = {
      id: newData.id,
      screeners: [...newData.screeners],
      name: newData.name,
      description: newData.description,
      period: newData.period,
    };
    const updated = [...strategies];
    updated[index] = newStrategy;
    StockAppAPI.saveStrategy(newStrategy).then(() => setStrategies(updated));
  };

  const submitStrategy = (strat: IStrategy) => {
    if (strat.id > 0) {
      StockAppAPI.saveStrategy(strat)
        .then(() => {
          const updated = strategies.map((s) =>
            s.id === strat.id ? { ...strat } : s,
          );
          setStrategies(updated);
          setDialogVisible(false);
          displaySuccess(toast, "Strategy Updated", { life: 4000 });
        })
        .catch((err) =>
          displayErrorWithMessage(toast, err, "Failed to save strategy: "),
        );
    } else {
      StockAppAPI.createStrategy(strat)
        .then((data) => {
          strat.id = data.id;
          setStrategies([...strategies, strat]);
          setDialogVisible(false);
          displaySuccess(toast, "Strategy Created", { life: 4000 });
        })
        .catch((err) =>
          displayErrorWithMessage(toast, err, "Failed to create strategy: "),
        );
    }
  };

  const confirmDeleteStrategy = (strategy: IStrategyWithIndex) => {
    setStrategy(strategy);
    setDeleteStrategyDialog(true);
  };

  const confirmDeleteSelected = () => setDeleteStrategiesDialog(true);
  const hideDeleteStrategyDialog = () => setDeleteStrategyDialog(false);
  const hideDeleteStrategiesDialog = () => setDeleteStrategiesDialog(false);

  const deleteStrategyHandler = () => {
    StockAppAPI.deleteStrategy(strategy.id)
      .then(() => {
        const filtered = strategies.filter((s) => s.id !== strategy.id);
        setStrategies(filtered);
        setDeleteStrategyDialog(false);
        displaySuccess(toast, "Strategy Deleted", { life: 3000 });
      })
      .catch((err) =>
        displayErrorWithMessage(toast, err, "Failed to delete strategy: "),
      );
  };

  const deleteSelectedStrategies = () => {
    StockAppAPI.deleteStrategies(selectedStrategies.map((s) => s.id))
      .then(() => {
        const remaining = strategies.filter(
          (val) => !selectedStrategies.includes(val),
        );
        setStrategies(remaining);
        setDeleteStrategiesDialog(false);
        setSelectedStrategies([]);
        displaySuccess(toast, "Strategies Deleted", { life: 3000 });
      })
      .catch((err) =>
        displayErrorWithMessage(toast, err, "Failed to delete strategies: "),
      );
  };

  const selectionChange = (
    e: DataTableSelectionMultipleChangeEvent<IStrategy[]>,
  ) => setSelectedStrategies(e.value);

  const duplicateStrategy = (strategyId: number, newName: string) => {
    const strategyToDuplicate = strategies.find((s) => s.id === strategyId);
    if (strategyToDuplicate) {
      const duplicatedStrategy: IStrategy = {
        ...JSON.parse(JSON.stringify(strategyToDuplicate)),
        id: 0,
        name: newName,
      };
      StockAppAPI.createStrategy(duplicatedStrategy)
        .then((data) => {
          duplicatedStrategy.id = data.id;
          setStrategies([...strategies, duplicatedStrategy]);
          displaySuccess(
            toast,
            `Strategy "${newName}" duplicated successfully`,
            { life: 4000 },
          );
        })
        .catch((err) =>
          displayErrorWithMessage(toast, err, "Failed to duplicate strategy: "),
        );
    }
  };

  const leftToolbar = (
    <div className="toolbar-actions">
      <Button
        label="New Strategy"
        icon="pi pi-plus"
        severity="success"
        onClick={openDialog}
      />
      <Button
        label="Delete Selected"
        icon="pi pi-trash"
        severity="danger"
        outlined
        disabled={!selectedStrategies.length}
        onClick={confirmDeleteSelected}
      />
    </div>
  );

  return (
    <div className="edit-strategies-page">
      <Toast ref={toast} onMouseLeave={hideToast} />
      <Toolbar className="page-toolbar" left={leftToolbar} />

      <div className="table-container">
        <EditStrategiesTable
          value={strategies}
          selection={selectedStrategies}
          onSelectionChange={selectionChange}
          onRowEditComplete={onRowEditComplete}
          editStrategy={(rowData, column) => {
            setDialogVisible(true);
            setStrategy({ ...rowData, idx: column.rowIndex });
          }}
          confirmDeleteStrategy={confirmDeleteStrategy}
          duplicateStrategy={duplicateStrategy}
        />
      </div>

      <StrategyDialog
        strategy={strategy}
        visible={dialogVisible}
        submit={submitStrategy}
        onHide={hideDialog}
      />

      <DeleteDialog
        visible={deleteStrategyDialog}
        hide={hideDeleteStrategyDialog}
        delete={deleteStrategyHandler}
      >
        <DialogBody
          message={`Are you sure you want to delete "${strategy.name}"?`}
        />
      </DeleteDialog>

      <DeleteDialog
        visible={deleteStrategiesDialog}
        hide={hideDeleteStrategiesDialog}
        delete={deleteSelectedStrategies}
      >
        <DialogBody message="Are you sure you want to delete the selected strategies?" />
      </DeleteDialog>
    </div>
  );
};

export default EditStrategiesPageNew;
