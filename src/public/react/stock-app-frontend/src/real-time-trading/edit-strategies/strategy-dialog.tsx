import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown, DropdownChangeEvent } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";

import React, { useState, useRef, useEffect } from "react";
import { InitUtil } from "../../shared/utilities/init-util";
import ScreenerNew from "./screener";
import { IScreener, IStrategy } from "../../shared/types";
import "./create-strategy.scss";

interface IProps {
  placeHolder?: "";
  strategy: IStrategy;
  visible: boolean;
  submit: (obj: IStrategy) => void;
  onHide: () => void;
}

const dropDownItems = [
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "1 day", value: 1440 },
  { label: "1 week", value: 10080 },
];

function generateTempId() {
  return "temp_" + Math.random().toString(36).slice(2, 10);
}

const StrategyDialog: React.FC<IProps> = (props) => {
  const [name, setName] = useState<string>(props.strategy.name || "");
  const [description, setDescription] = useState<string>(
    props.strategy.description || "",
  );
  const [selectedPeriod, setSelectedPeriod] = useState<number>(
    props.strategy.period || 0,
  );
  const [screeners, setScreeners] = useState<IScreener[]>(() =>
    InitUtil.getDeepCopy(props.strategy.screeners || []),
  );
  const [screenersUnderEdit, setScreenersUnderEdit] = useState<number>(0);
  const [error, setError] = useState<string>("");

  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const propsStringRef = useRef<string>(JSON.stringify(props.strategy));

  useEffect(() => {
    // when dialog becomes visible, sync state from props.strategy if different
    if (props.visible) {
      const str1 = JSON.stringify(props.strategy);
      const str2 = JSON.stringify({
        screeners,
        name,
        description,
        period: selectedPeriod,
      });
      if (str1 !== str2) {
        const parsed = JSON.parse(str1);
        setScreeners(parsed.screeners || []);
        setName(parsed.name || "");
        setDescription(parsed.description || "");
        setSelectedPeriod(parsed.period || 0);
        setScreenersUnderEdit(0);
      }
      propsStringRef.current = str1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  const saveScreener = (newScreener: IScreener, index: number) => {
    setScreeners((prev) => prev.map((s, i) => (i === index ? newScreener : s)));
    setScreenersUnderEdit((c) => Math.max(0, c - 1));
  };

  const cancelEdit = () => {
    setScreenersUnderEdit((c) => Math.max(0, c - 1));
  };

  const removeScreener = (index: number) => {
    setScreeners((prev) => {
      const next = [...prev.slice(0, index), ...prev.slice(index + 1)];
      return next;
    });
    setScreenersUnderEdit((c) => Math.max(0, c - 1));
  };

  // const stringifyFilter = (filter: IFilter) => [filter.varName, filter.operator, filter.compareVal].join(" ");

  // const createFilter = (): IFilter => InitUtil.initFilter();

  const addScreener = () => {
    const filterGroup = InitUtil.initFilterGroup();
    const newScreener: IScreener = {
      id: generateTempId(),
      buySellFilters: { enter: { ...filterGroup }, exit: { ...filterGroup } },
      shortCoverFilters: {
        enter: { ...filterGroup },
        exit: { ...filterGroup },
      },
    };
    setScreeners((prev) => [...prev, newScreener]);
    setScreenersUnderEdit((c) => c + 1);
  };

  const addToScreenersUnderEdit = () => setScreenersUnderEdit((c) => c + 1);

  const handleSubmit = () => {
    const inEditMode =
      screenersUnderEdit > 0 ||
      screeners.length === 0 ||
      !name ||
      !description ||
      !selectedPeriod;
    if (inEditMode) {
      setError(
        "All required fields must be filled out, and all of the screeners must be finished editing.",
      );
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (unChanged()) {
      setError("Strategy is unchanged");
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const cloned = InitUtil.getDeepCopy(screeners);
    props.submit({
      id: props.strategy.id,
      screeners: cloned,
      name,
      description,
      period: selectedPeriod,
    });
    setError("");
  };

  const unChanged = () => {
    const propsScreenerStr = JSON.stringify(props.strategy.screeners || []);
    const screenerStr = JSON.stringify(screeners || []);
    const unchanged =
      screenerStr === propsScreenerStr &&
      selectedPeriod === props.strategy.period &&
      name === props.strategy.name &&
      description === props.strategy.description;
    return unchanged;
  };

  const onPeriodChange = (e: DropdownChangeEvent) =>
    setSelectedPeriod(e.value as number);

  const onHide = () => {
    setError("");
    props.onHide();
  };

  const footer = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        onClick={onHide}
        className="p-button-text"
      />
      <Button label="OK" icon="pi pi-check" onClick={handleSubmit} autoFocus />
    </div>
  );

  return (
    <Dialog
      baseZIndex={1101}
      header={
        props.strategy.screeners?.length ? "Edit strategy" : "Add strategy"
      }
      visible={props.visible}
      style={{ width: "40rem", maxWidth: "90vw" }}
      footer={footer}
      onHide={onHide}
    >
      <div className="strategy-form">
        <div className="form-row">
          <label htmlFor="strategy-name">
            Strategy name<span className="required">*</span>
          </label>
          <InputText
            id="strategy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter strategy name"
          />
        </div>

        <div className="form-row">
          <label htmlFor="description">
            Description<span className="required">*</span>
          </label>
          <InputText
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description"
          />
        </div>

        <div className="form-row">
          <label htmlFor="period">
            Period<span className="required">*</span>
          </label>
          <Dropdown
            id="period"
            value={selectedPeriod}
            options={dropDownItems}
            onChange={onPeriodChange}
            placeholder="Select a period"
            className="w-full"
          />
        </div>

        <div className="screeners-section">
          <h3>Screeners</h3>
          {screeners.map((screener, i) => (
            <ScreenerNew
              key={screener.id}
              addToScreenersUnderEdit={addToScreenersUnderEdit}
              cancelEdit={cancelEdit}
              removeScreener={removeScreener}
              index={i}
              screener={screener}
              saveScreener={saveScreener}
              period={selectedPeriod}
            />
          ))}
          <Button
            label="Add screener"
            icon="pi pi-plus"
            onClick={addScreener}
            className="p-button-sm add-screener-btn"
          />
        </div>

        {error && (
          <p ref={errorRef} className="error-msg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default StrategyDialog;
