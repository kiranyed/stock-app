import { Button } from "primereact/button";
import { Chips, ChipsChangeEvent } from "primereact/chips";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { FileUpload, FileUploadSelectEvent } from "primereact/fileupload";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";
import { Toolbar } from "primereact/toolbar";
import React, { useState, useEffect, useRef } from "react";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { ReactEvent } from "../shared/types";
import {
  displayError,
  displayErrorWithMessage,
  displaySuccess,
} from "../shared/toast-util";
import "./stock-group.scss";

interface StockGroup {
  name: string;
  symbols: string[];
  id: number;
}

interface IState {
  groups: StockGroup[];
  selectedGroups: StockGroup[];
  groupDialog: boolean;
  deleteGroupDialog: boolean;
  deleteGroupsDialog: boolean;
  group: StockGroup;
  errorText: string;
  globalFilter?: string;
}

interface IToastProps {
  summary: string;
  detail: string;
  severity:
    | "info"
    | "success"
    | "warn"
    | "error"
    | "secondary"
    | "contrast"
    | undefined;
}

interface IStockGroupDialogProps {
  visible: boolean;
  group: StockGroup;
  hideDialog: () => void;
  saveGroup: (group: StockGroup) => void;
  errorText: string;
}

function StockGroupDialog(props: IStockGroupDialogProps) {
  const [name, setName] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const toast = useRef<Toast | null>(null);
  const [error, setError] = useState("");

  const toastDisplay = (toastProps: IToastProps) => {
    if (toast.current) {
      toast.current.show(toastProps);
    }
  };

  const onHandleFile = (e: FileUploadSelectEvent) => {
    const file = e.files[0];

    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = (evt) => {
      const str = evt && evt.target && (evt.target.result as string);
      if (str && typeof str === "string") {
        setSymbols(
          str
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
        toastDisplay({
          severity: "success",
          summary: "Uploaded",
          detail: "Symbols loaded from file",
        });
      }
    };
  };

  useEffect(() => {
    setName(props.group.name || "");
    setSymbols(props.group.symbols || []);
    setError("");
  }, [props.group, props.visible]);

  const unChanged = () => {
    return (
      name === props.group.name &&
      symbols.join(",") === (props.group.symbols || []).join(",")
    );
  };

  const validate = () => {
    const invalid = !name || !symbols.length;
    return !invalid;
  };

  const save = () => {
    const valid = validate();
    if (!valid) {
      setError("Please fill in all required fields.");
      return;
    }
    if (unChanged()) {
      setError("No changes to save.");
      return;
    }
    setError("");
    props.saveGroup({ name, symbols, id: props.group.id ? props.group.id : 0 });
  };

  const onHide = () => {
    setError("");
    props.hideDialog();
  };

  const groupDialogFooter = (
    <React.Fragment>
      <Button
        label="Cancel"
        icon="pi pi-times"
        className="p-button-text"
        onClick={onHide}
      />
      <Button
        label="Save"
        icon="pi pi-check"
        className="p-button-primary"
        onClick={save}
        disabled={!validate() || unChanged()}
      />
    </React.Fragment>
  );

  return (
    <Dialog
      visible={props.visible}
      style={{ width: "540px", borderRadius: 8 }}
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i className="pi pi-folder-open" /> Group Details
        </div>
      }
      modal
      className="p-fluid"
      footer={groupDialogFooter}
      onHide={onHide}
    >
      <Toast ref={toast} />
      <div className="group-dialog-form" style={{ display: "grid", gap: 12 }}>
        <div
          className="form-row"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <label style={{ fontSize: 13, fontWeight: 600 }}>Group name</label>
          <InputText
            value={name}
            onChange={(e: ReactEvent) => setName(e.target.value)}
            placeholder="Enter a descriptive group name"
            aria-label="Group name"
            autoFocus
          />
        </div>

        <div
          className="form-row"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <label style={{ fontSize: 13, fontWeight: 600 }}>Symbols</label>
          <Chips
            placeholder="Type symbol and press Enter or use comma"
            separator=","
            value={symbols}
            onChange={(e: ChipsChangeEvent) => setSymbols(e.value || [])}
          />
          <small style={{ color: "#6b7280" }}>
            You can also upload a .txt with comma separated symbols
          </small>
          <FileUpload
            mode="basic"
            onSelect={onHandleFile}
            accept=".txt"
            maxFileSize={1000000}
            chooseLabel="Upload"
            style={{ marginTop: 6 }}
          />
        </div>

        <div
          className="form-row"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <label style={{ fontSize: 13, fontWeight: 600 }}>Preview</label>
          <div
            className="symbol-preview"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {symbols.length ? (
              symbols.map((s, idx) => (
                <span
                  key={s + idx}
                  className="symbol-tag"
                  style={{
                    background: "#eef2ff",
                    color: "#3730a3",
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    border: "1px solid rgba(99,102,241,0.12)",
                  }}
                >
                  {s}
                </span>
              ))
            ) : (
              <small style={{ color: "#9ca3af" }}>No symbols added yet</small>
            )}
          </div>
          <small style={{ color: "#6b7280" }}>{symbols.length} symbol(s)</small>
        </div>

        {error ? (
          <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>
        ) : null}
      </div>
    </Dialog>
  );
}

class StockGroupsPage extends React.Component<object, IState> {
  state: IState = {
    errorText: "",
    deleteGroupsDialog: false,
    group: { id: 0, name: "", symbols: [] },
    groupDialog: false,
    deleteGroupDialog: false,
    selectedGroups: [],
    groups: [],
    globalFilter: "",
  };

  toast: React.RefObject<Toast | null>;

  constructor(props: object) {
    super(props);
    this.toast = React.createRef<Toast>();
    this.leftToolbarTemplate = this.leftToolbarTemplate.bind(this);
    this.setSelectedGroups = this.setSelectedGroups.bind(this);
    this.saveGroup = this.saveGroup.bind(this);
  }

  emptyGroup: StockGroup = {
    id: 0,
    name: "",
    symbols: [],
  };

  componentDidMount() {
    StockAppAPI.getAllStockGroups()
      .then((groups) => {
        this.setState({ groups });
      })
      .catch((err) => {
        console.log(err);
      });
  }

  addGroup = () => {
    this.setState({ group: this.emptyGroup, groupDialog: true });
  };

  findIndexById = (id: number) => {
    let index = -1;
    for (let i = 0; i < this.state.groups.length; i++) {
      if (this.state.groups[i].id === id) {
        index = i;
        break;
      }
    }
    return index;
  };

  saveGroup(group: StockGroup) {
    const groups = [...this.state.groups];
    if (!this.state.group.id) {
      StockAppAPI.createStockGroup(group.name, group.symbols)
        .then((data) => {
          group.id = data.id;
          groups.push(group);
          this.setState({
            groups,
            groupDialog: false,
            group: this.emptyGroup,
            errorText: "",
          });
          displaySuccess(this.toast, "Group Created", { life: 3000 });
        })
        .catch((err) => {
          displayError(this.toast, err);
        });
    } else {
      const index = this.findIndexById(this.state.group.id);
      groups[index] = group;
      StockAppAPI.saveStockGroup(group.name, group.symbols, group.id)
        .then(() => {
          this.setState({
            groups,
            groupDialog: false,
            group: this.emptyGroup,
          });
          displaySuccess(this.toast, "Group Updated", { life: 3000 });
        })
        .catch((err) => {
          displayErrorWithMessage(this.toast, err, "Failed to update group: ", {
            life: 3000,
          });
        });
    }
  }

  editGroup = (group: StockGroup) => {
    this.setState({
      group: { ...group },
      groupDialog: true,
    });
  };

  confirmDeleteGroup = (group: StockGroup) => {
    this.setState({
      group,
      deleteGroupDialog: true,
    });
  };

  confirmDeleteSelected = () => {
    this.setState({ deleteGroupsDialog: true });
  };

  deleteSelectedGroups = () => {
    const groups = this.state.groups.filter(
      (val) => !this.state.selectedGroups.includes(val),
    );
    StockAppAPI.deleteGroups(this.state.selectedGroups.map((group) => group.id))
      .then(() => {
        this.setState({
          groups,
          deleteGroupsDialog: false,
          selectedGroups: [],
        });
        displaySuccess(this.toast, "Groups Deleted");
      })
      .catch((err) => {
        if (err.response) {
          console.log(err.response.data.message);
        } else {
          console.log(err.message);
        }
      });
  };

  leftToolbarTemplate() {
    return (
      <React.Fragment>
        <Button
          label="New"
          icon="pi pi-plus"
          className="p-button-success mr-2"
          onClick={this.addGroup}
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          className="p-button-danger"
          onClick={this.confirmDeleteSelected}
          disabled={
            !this.state.selectedGroups || !this.state.selectedGroups.length
          }
        />
      </React.Fragment>
    );
  }

  actionBodyTemplate = (rowData: StockGroup) => {
    return (
      <React.Fragment>
        <Button
          icon="pi pi-pencil"
          className="p-button-rounded p-button-success mr-2"
          onClick={() => this.editGroup(rowData)}
        />
        <Button
          icon="pi pi-trash"
          className="p-button-rounded p-button-warning"
          onClick={() => this.confirmDeleteGroup(rowData)}
        />
      </React.Fragment>
    );
  };

  deleteGroup = () => {
    const groups = this.state.groups.filter(
      (val) => val.id !== this.state.group.id,
    );
    StockAppAPI.deleteGroup(this.state.group.id)
      .then(() => {
        this.setState({
          groups,
          deleteGroupDialog: false,
          group: this.emptyGroup,
        });
        displaySuccess(this.toast, "Group Deleted", { life: 3000 });
      })
      .catch((err) => {
        displayErrorWithMessage(this.toast, err, "Failed to delete group: ", {
          life: 3000,
        });
      });
  };

  hideDialog = () => {
    this.setState({
      groupDialog: false,
    });
  };

  hideDeleteGroupDialog = () => {
    this.setState({ deleteGroupDialog: false });
  };

  hideDeleteGroupsDialog = () => {
    this.setState({ deleteGroupsDialog: false });
  };

  setSelectedGroups(e: { value: StockGroup[] }) {
    this.setState({ selectedGroups: e.value });
  }

  render() {
    const paginatorLeft = (
      <Button type="button" icon="pi pi-refresh" className="p-button-text" />
    );
    const paginatorRight = (
      <Button type="button" icon="pi pi-cloud" className="p-button-text" />
    );

    // const deleteGroupDialogFooter = (
    //   <React.Fragment>
    //     <Button label="No" icon="pi pi-times" className="p-button-text" onClick={this.hideDeleteGroupDialog} />
    //     <Button label="Yes" icon="pi pi-check" className="p-button-text" onClick={this.deleteGroup} />
    //   </React.Fragment>
    // );
    // const deleteGroupsDialogFooter = (
    //   <React.Fragment>
    //     <Button label="No" icon="pi pi-times" className="p-button-text" onClick={this.hideDeleteGroupsDialog} />
    //     <Button label="Yes" icon="pi pi-check" className="p-button-text" onClick={this.deleteSelectedGroups} />
    //   </React.Fragment>
    // );

    const symbolTemplate = (rowData: StockGroup) => {
      return (
        <React.Fragment>{(rowData.symbols || []).join(", ")}</React.Fragment>
      );
    };

    const filter = (this.state.globalFilter || "").trim().toLowerCase();
    const filteredGroups = filter
      ? this.state.groups.filter(
          (g) =>
            g.name.toLowerCase().includes(filter) ||
            (g.symbols || []).join(",").toLowerCase().includes(filter),
        )
      : this.state.groups;

    const header = (
      <div className="table-header">
        <h3 className="table-title">Stock Groups</h3>
        <div className="table-controls">
          <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText
              placeholder="Search by name or symbol"
              value={this.state.globalFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                this.setState({ globalFilter: e.target.value })
              }
            />
          </span>
        </div>
      </div>
    );

    const toolbarLeft = (
      <div
        className="toolbar-left"
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <Button
          label="New"
          icon="pi pi-plus"
          className="p-button-success"
          onClick={this.addGroup}
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          className="p-button-danger"
          onClick={this.confirmDeleteSelected}
          disabled={
            !this.state.selectedGroups || !this.state.selectedGroups.length
          }
        />
        {/* <Button label="Export" icon="pi pi-download" className="p-button-secondary" onClick={this.onExport} />
        <label className="p-button p-button-secondary import-button" style={{ marginLeft: 4 }}>
          <input type="file" accept=".json,.csv" onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.onImport(e.target.files)} style={{ display: 'none' }} />
          <i className="pi pi-upload" style={{ marginRight: 8 }} />Import
        </label> */}
      </div>
    );

    const toolbarRight = (
      <div
        className="toolbar-right"
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <div className="group-count" style={{ fontSize: 13, color: "#374151" }}>
          Groups: <strong>{this.state.groups.length}</strong>
        </div>
      </div>
    );

    return (
      <div className="main stock-groups-page">
        <Toast ref={this.toast} />

        <Toolbar
          className="mb-4"
          left={toolbarLeft}
          right={toolbarRight}
        ></Toolbar>

        <DataTable
          header={header}
          value={filteredGroups}
          selection={this.state.selectedGroups}
          onSelectionChange={this.setSelectedGroups}
          dataKey="id"
          selectionMode="multiple"
          responsiveLayout="scroll"
          paginator
          paginatorTemplate="CurrentPageReport FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          currentPageReportTemplate="Showing {first} to {last} of {totalRecords}"
          rows={10}
          rowsPerPageOptions={[10, 20, 50]}
          paginatorLeft={paginatorLeft}
          paginatorRight={paginatorRight}
          globalFilterFields={["name"]}
          emptyMessage="No stock groups found."
        >
          <Column
            selectionMode="multiple"
            headerStyle={{ width: "3rem" }}
            exportable={false}
          ></Column>
          <Column field="id" header="ID" style={{ width: "4rem" }}></Column>
          <Column
            filter
            filterPlaceholder="Search by name"
            sortable
            field="name"
            header="Name"
            style={{ minWidth: "12rem" }}
          ></Column>
          <Column
            body={symbolTemplate}
            field="symbols"
            header="Symbols"
            style={{
              minWidth: "18rem",
              whiteSpace: "normal",
              wordBreak: "break-word",
            }}
          ></Column>
          <Column
            body={this.actionBodyTemplate}
            exportable={false}
            style={{ minWidth: "8rem", textAlign: "center" }}
          ></Column>
        </DataTable>

        <StockGroupDialog
          errorText={this.state.errorText}
          visible={this.state.groupDialog}
          hideDialog={this.hideDialog}
          group={this.state.group}
          saveGroup={this.saveGroup}
        />

        <Dialog
          visible={this.state.deleteGroupDialog}
          style={{ width: "520px", borderRadius: 8 }}
          header={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <i
                className="pi pi-exclamation-triangle"
                style={{ color: "#f59e0b", fontSize: 20 }}
              />{" "}
              Confirm delete
            </div>
          }
          modal
          footer={
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <Button
                label="Cancel"
                icon="pi pi-times"
                className="p-button-text"
                onClick={this.hideDeleteGroupDialog}
              />
              <Button
                label="Yes, delete"
                icon="pi pi-check"
                className="p-button-danger"
                onClick={this.deleteGroup}
                autoFocus
                aria-label="Confirm delete group"
              />
            </div>
          }
          onHide={this.hideDeleteGroupDialog}
        >
          <div
            className="confirmation-content"
            style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
          >
            <i
              className="pi pi-trash"
              style={{ fontSize: "2.2rem", color: "#dc2626" }}
            />
            <div style={{ flex: 1 }}>
              {this.state.group && (
                <>
                  <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}
                  >
                    Delete group “{this.state.group.name}”?
                  </div>
                  <div style={{ color: "#6b7280", marginBottom: 10 }}>
                    This action will permanently remove the group and cannot be
                    undone.
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>Symbols:</strong>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(this.state.group.symbols || [])
                      .slice(0, 20)
                      .map((s, i) => (
                        <span
                          key={s + i}
                          style={{
                            background: "#fff5f5",
                            color: "#9f1239",
                            borderRadius: 999,
                            padding: "4px 8px",
                            fontSize: 12,
                            border: "1px solid rgba(220,38,38,0.08)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    {(this.state.group.symbols || []).length > 20 && (
                      <small style={{ color: "#6b7280" }}>
                        +{(this.state.group.symbols || []).length - 20} more
                      </small>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Dialog>

        {/* Confirm bulk delete */}
        <Dialog
          visible={this.state.deleteGroupsDialog}
          style={{ width: "560px", borderRadius: 8 }}
          header={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <i
                className="pi pi-exclamation-triangle"
                style={{ color: "#f59e0b", fontSize: 20 }}
              />{" "}
              Confirm delete
            </div>
          }
          modal
          footer={
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <Button
                label="Cancel"
                icon="pi pi-times"
                className="p-button-text"
                onClick={this.hideDeleteGroupsDialog}
              />
              <Button
                label={`Delete ${this.state.selectedGroups?.length || 0}`}
                icon="pi pi-check"
                className="p-button-danger"
                onClick={this.deleteSelectedGroups}
                autoFocus
                aria-label="Confirm delete selected groups"
              />
            </div>
          }
          onHide={this.hideDeleteGroupsDialog}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <i
                className="pi pi-trash"
                style={{ fontSize: "2rem", color: "#dc2626" }}
              />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {this.state.selectedGroups?.length || 0} group(s) will be
                  deleted
                </div>
                <div style={{ color: "#6b7280" }}>
                  This action cannot be undone. The groups and their symbol
                  lists will be removed.
                </div>
              </div>
            </div>

            <div
              style={{
                maxHeight: 180,
                overflowY: "auto",
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid rgba(15,23,42,0.04)",
                background: "#fff",
              }}
            >
              {this.state.selectedGroups && this.state.selectedGroups.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {this.state.selectedGroups.map((g) => (
                    <li key={g.id} style={{ marginBottom: 6 }}>
                      <strong>{g.name}</strong>{" "}
                      <small style={{ color: "#6b7280" }}>
                        ({(g.symbols || []).length} symbols)
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#6b7280" }}>No groups selected.</div>
              )}
            </div>
          </div>
        </Dialog>
      </div>
    );
  }
}

export default StockGroupsPage;
