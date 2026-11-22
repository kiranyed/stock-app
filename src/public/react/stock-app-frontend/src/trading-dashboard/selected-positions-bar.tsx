// SelectedPositionsBar.tsx
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { IPosition } from "../shared/trading-types";
import { orderOptions } from "./trading-page";
import React from "react";

interface Props {
  positions: IPosition[];
  orderType: string;
  isMarket: boolean;
  limitPercent: string;
  orderQuantityPercent: string;
  setOrderType: (type: string) => void;
  setIsMarket: (isMarket: boolean) => void;
  setLimitPercent: (val: string) => void;
  setOrderQuantityPercent: (val: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}

export default function SelectedPositionsBar({
  positions,
  orderType,
  isMarket,
  limitPercent,
  orderQuantityPercent,
  setOrderType,
  setIsMarket,
  setLimitPercent,
  setOrderQuantityPercent,
  onSubmit,
  onClear,
}: Props) {
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

  return (
    <div className="selected-bar">
      <div className="selected-bar__summary">
        <strong>{positions.length}</strong> selected • <strong>${totalValue.toFixed(2)}</strong>
        <Button
          icon="pi pi-times"
          rounded
          text
          severity="danger"
          size="small"
          aria-label="Clear selection"
          onClick={onClear}
        />
      </div>

      <div className="selected-bar__controls">
        <Dropdown
          value={orderType}
          options={orderOptions}
          onChange={(e) => setOrderType(e.value)}
          placeholder="Order Type"
        />

        <div className="selected-bar__order-mode">
          <div className="selected-bar__radio-option">
            <RadioButton
              inputId="isMarket"
              value="market"
              checked={isMarket}
              onChange={() => setIsMarket(true)}
            />
            <label htmlFor="isMarket">Market</label>
          </div>
          <div className="selected-bar__radio-option">
            <RadioButton
              inputId="isLimit"
              value="limit"
              checked={!isMarket}
              onChange={() => setIsMarket(false)}
            />
            <label htmlFor="isLimit">Limit</label>
          </div>
        </div>

        {!isMarket && (
          <InputText
            placeholder="% of value"
            value={limitPercent}
            onChange={(e) => setLimitPercent(e.target.value)}
          />
        )}

        <InputText
          placeholder="Qty %"
          value={orderQuantityPercent}
          onChange={(e) => setOrderQuantityPercent(e.target.value)}
        />

        <Button
          label="Submit Orders"
          icon="pi pi-check"
          severity="success"
          onClick={onSubmit}
        />
      </div>
    </div>
  );
}
