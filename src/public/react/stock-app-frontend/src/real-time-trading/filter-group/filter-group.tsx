import React, { useState } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InitUtil } from "../../shared/utilities/init-util";
import "./filter-group.scss";
import { FilterGroupUtil } from "./filter-group-util";
import { Dropdown } from "primereact/dropdown";
import { Filter } from "./filter";
import { IFilter, IFilterGroup, TransactionType } from "../../shared/types";

interface IProps {
  group: IFilterGroup;
  type?: TransactionType;
  save: (group: IFilterGroup) => void;
  clear: (type: TransactionType) => void;
  /** Strategy candle period for session limit validation */
  period?: number;
}

const FilterGroup: React.FC<IProps> = (props) => {
  const [group, setGroup] = useState<IFilterGroup>(InitUtil.initFilterGroup());
  const [visible, setVisible] = useState(false);
  const [validMessage, setValidMessage] = useState("");

  const removeFilter = (i: number) => {
    if (i > 0) {
      setGroup((g) => ({
        ...g,
        filters: [
          ...g.filters.slice(0, i),
          ...g.filters.slice(i + 1, g.filters.length),
        ],
        connectors: [
          ...g.connectors.slice(0, i - 1),
          ...g.connectors.slice(i, g.connectors.length),
        ],
      }));
    } else {
      setGroup((g) => ({
        ...g,
        filters: [
          ...g.filters.slice(0, i),
          ...g.filters.slice(i + 1, g.filters.length),
        ],
      }));
    }
  };

  const addFilter = () =>
    setGroup((g) => ({
      ...g,
      filters: [...g.filters, InitUtil.initFilter()],
      connectors: [...g.connectors, "AND"],
      valid: false,
    }));

  const validate = () => {
    const msg = FilterGroupUtil.validate(group.filters);
    setValidMessage(msg);
    return !msg;
  };

  const isUnchanged = (): boolean => {
    const propFiltersString = JSON.stringify(props.group.filters);
    const stateFiltersString = JSON.stringify(group.filters);
    const propConnectorsString = JSON.stringify(props.group.connectors);
    const stateConnectorsString = JSON.stringify(group.connectors);
    return (
      propFiltersString === stateFiltersString &&
      propConnectorsString === stateConnectorsString
    );
  };

  const openDialog = () => {
    setGroup((prev) => ({
      ...prev,
      filters: InitUtil.getDeepCopy(props.group.filters),
      connectors: InitUtil.getDeepCopy(props.group.connectors),
    }));
    setVisible(true);
  };

  const onHide = () => {
    setGroup((prev) => ({
      ...prev,
      filters: InitUtil.getDeepCopy(props.group.filters),
      connectors: InitUtil.getDeepCopy(props.group.connectors),
    }));
    setVisible(false);
    setValidMessage("");
  };

  const makeChange = (name: string, val: string, index: number) => {
    if (name === "connector") {
      // mirror original implementation (uses index directly)
      setGroup((g) => ({
        ...g,
        connectors: [
          ...g.connectors.slice(0, index),
          val,
          ...g.connectors.slice(index + 1),
        ],
      }));
    } else {
      setGroup((g) => ({
        ...g,
        filters: [
          ...g.filters.slice(0, index),
          { ...g.filters[index], [name]: val },
          ...g.filters.slice(index + 1),
        ],
      }));
    }
  };

  const handleOK = () => {
    const valid = validate();
    const unchanged = isUnchanged();
    if (valid && unchanged) {
      setValidMessage("No changes made to the filter group");
    } else if (valid) {
      setValidMessage("");
      setVisible(false);
      props.save({ ...group });
    }
  };

  const groupString = InitUtil.convertFilterGroupToString(props.group);
  const prefix = props.type
    ? props.type + " if: "
    : "Include stocks that have the following attributes: ";
  const footer = (
    <span>
      <Button label={"OK"} onClick={handleOK} />{" "}
      <Button label={"Cancel"} onClick={onHide} />
    </span>
  );

  const filtersExpr = (
    <FilterGroupEditable
      filters={group.filters}
      connectors={group.connectors}
      makeChange={makeChange}
      type={props.type}
      removeFilter={removeFilter}
      period={props.period}
    />
  );

  return (
    <>
      <div className={"chilling"} onClick={openDialog}>
        <span>{prefix + groupString}</span>
        <span className="clear-button">
          <Button
            label="Clear"
            onClick={() => props.clear(props.type!)}
          ></Button>
        </span>
      </div>

      <Dialog
        baseZIndex={1104}
        className="testing"
        header={prefix}
        visible={visible}
        onHide={onHide}
        footer={footer}
      >
        <div>
          {filtersExpr}
          <Button label={"Add filter"} onClick={addFilter} />
          <br />
          <br />
          {validMessage && <p className="error">{validMessage}</p>}
        </div>
      </Dialog>
    </>
  );
};

export default FilterGroup;

interface IFilterGroupEditableProps {
  filters: IFilter[];
  connectors: string[];
  type?: string;
  makeChange: (name: string, val: string, index: number) => void;
  removeFilter: (i: number) => void;
  period?: number;
}

function FilterGroupEditable(props: IFilterGroupEditableProps) {
  return (
    <div>
      {props.filters.map((filter: IFilter, i: number) => {
        const filterJsx = (
          <Filter
            filter={filter}
            type={props.type}
            makeChange={props.makeChange}
            index={i}
            period={props.period}
          />
        );
        let returnExpr;
        if (i > 0) {
          returnExpr = (
            <React.Fragment>
              <Dropdown
                onChange={(e) =>
                  props.makeChange(
                    "connector",
                    e.value,
                    /* i - 1 because connectors are between filters */ i - 1,
                  )
                }
                value={props.connectors[i - 1]}
                options={[
                  { label: "AND", value: "AND" },
                  { label: "OR", value: "OR" },
                ]}
              ></Dropdown>
              <br />
              <br />
              {filterJsx}
            </React.Fragment>
          );
        } else {
          returnExpr = filterJsx;
        }
        returnExpr = (
          <div key={i} className="filter-group">
            {returnExpr}{" "}
            <Button
              onClick={() => props.removeFilter(i)}
              icon="pi pi-trash"
            ></Button>
          </div>
        );
        return returnExpr;
      })}
    </div>
  );
}
