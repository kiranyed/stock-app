import React, { useState } from "react";
import { Button } from "primereact/button";
import { InitUtil } from "../../shared/utilities/init-util";
import FilterGroup from "../filter-group/filter-group";
import "./screener.scss";
import { ScreenerUtil } from "./screener-util";
import { ScreenerDisplay } from "./screener-display";
import { IFilterGroup, IScreener, TransactionType } from "../../shared/types";

interface IProps {
  screener: IScreener;
  saveScreener: (screener: IScreener, index: number) => void;
  index: number;
  cancelEdit: () => void;
  removeScreener: (index: number) => void;
  addToScreenersUnderEdit: () => void;
  /** Strategy candle period for session limit validation */
  period?: number;
}

const ScreenerNew: React.FC<IProps> = (props) => {
  const initialScreener = InitUtil.getDeepCopy(props.screener);
  let initialInEditMode = true;
  let initialFresh = true;

  if (
    InitUtil.isNotEmpty(initialScreener.buySellFilters) ||
    InitUtil.isNotEmpty(initialScreener.shortCoverFilters)
  ) {
    initialInEditMode = false;
    initialFresh = false;
  }

  const [screener, setScreener] = useState<IScreener>(initialScreener);
  const [inEditMode, setInEditMode] = useState(initialInEditMode);
  const [fresh, setFresh] = useState(initialFresh);
  const [error, setError] = useState("");

  const saveGroup = (group: IFilterGroup, type: string) => {
    const clone = JSON.parse(JSON.stringify(group));
    const enterOrExit = type === "buy" || type === "short" ? "enter" : "exit";
    const buyShort =
      type === "buy" || type === "sell"
        ? "buySellFilters"
        : "shortCoverFilters";

    setScreener((prev) => ({
      ...prev,
      [buyShort]: {
        ...prev[buyShort]!,
        [enterOrExit]: clone,
      },
    }));
  };

  const isChanged = () => {
    const str1 = JSON.stringify(screener.buySellFilters);
    const str2 = JSON.stringify(props.screener.buySellFilters);
    const str3 = JSON.stringify(screener.shortCoverFilters);
    const str4 = JSON.stringify(props.screener.shortCoverFilters);
    return str1 !== str2 || str3 !== str4;
  };

  const save = () => {
    const valid =
      (screener.buySellFilters || screener.shortCoverFilters) &&
      ScreenerUtil.validate(
        screener.buySellFilters,
        screener.shortCoverFilters,
      );
    const unChanged = !isChanged();

    if (!valid) {
      setError(
        "Either both buy and sell filters must be filled, or short and cover filters.",
      );
    } else if (unChanged) {
      setError("No changes made to the screener.");
    } else {
      setInEditMode(false);
      setFresh(false);
      setError("");
      const newScreener = InitUtil.initScreener();
      if (
        screener.buySellFilters &&
        InitUtil.isNotEmpty(screener.buySellFilters)
      ) {
        newScreener.buySellFilters = {
          ...InitUtil.getDeepCopy(screener.buySellFilters),
        };
      }
      if (
        screener.shortCoverFilters &&
        InitUtil.isNotEmpty(screener.shortCoverFilters)
      ) {
        newScreener.shortCoverFilters = {
          ...InitUtil.getDeepCopy(screener.shortCoverFilters),
        };
      }
      props.saveScreener(newScreener, props.index);
    }
  };

  const remove = () => props.removeScreener(props.index);

  const cancel = () => {
    setScreener({
      buySellFilters: props.screener.buySellFilters
        ? InitUtil.getDeepCopy(props.screener.buySellFilters)
        : undefined,
      shortCoverFilters: props.screener.shortCoverFilters
        ? InitUtil.getDeepCopy(props.screener.shortCoverFilters)
        : undefined,
    });
    setInEditMode(false);
    setError("");
    props.cancelEdit();
  };

  const editScreener = () => {
    props.addToScreenersUnderEdit();
    setInEditMode(true);
  };

  const clear = (type: TransactionType) => {
    const enterOrExit = type === "buy" || type === "short" ? "enter" : "exit";
    const buyShort =
      type === "buy" || type === "short"
        ? "buySellFilters"
        : "shortCoverFilters";
    setScreener((prev) => ({
      ...prev,
      [buyShort]: {
        ...prev[buyShort]!,
        [enterOrExit]: { filters: [], connectors: [] },
      },
    }));
  };

  return (
    <div className="screener">
      <div className="screener-header">
        <h3>Screener</h3>
        <Button
          icon="pi pi-trash"
          label="Remove"
          className="p-button-text p-button-danger"
          onClick={remove}
        />
      </div>

      <div className="screener-content">
        {!inEditMode && (
          <ScreenerDisplay
            screener={props.screener}
            editScreener={editScreener}
          />
        )}

        {inEditMode && (
          <div className="screener-edit">
            {screener.buySellFilters && (
              <>
                <FilterGroup
                  clear={clear}
                  type={TransactionType.BUY}
                  group={screener.buySellFilters.enter}
                  save={(group: IFilterGroup) => saveGroup(group, "buy")}
                  period={props.period}
                />
                <FilterGroup
                  clear={clear}
                  type={TransactionType.SELL}
                  group={screener.buySellFilters.exit}
                  save={(group: IFilterGroup) => saveGroup(group, "sell")}
                  period={props.period}
                />
              </>
            )}

            {screener.shortCoverFilters && (
              <>
                <FilterGroup
                  clear={clear}
                  type={TransactionType.SHORT}
                  group={screener.shortCoverFilters.enter}
                  save={(group: IFilterGroup) => saveGroup(group, "short")}
                  period={props.period}
                />
                <FilterGroup
                  clear={clear}
                  type={TransactionType.COVER}
                  group={screener.shortCoverFilters.exit}
                  save={(group: IFilterGroup) => saveGroup(group, "cover")}
                  period={props.period}
                />
              </>
            )}

            {error && <p className="error">{error}</p>}

            <div className="screener-actions">
              <Button label="Save" icon="pi pi-check" onClick={save} />
              <Button
                label="Cancel"
                icon="pi pi-times"
                onClick={cancel}
                disabled={fresh}
                className="p-button-text"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScreenerNew;
