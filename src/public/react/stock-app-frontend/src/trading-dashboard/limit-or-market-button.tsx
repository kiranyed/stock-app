import * as React from "react";
import { RadioButton, RadioButtonChangeEvent } from "primereact/radiobutton";
import { InputText } from "primereact/inputtext";

interface IProps {
  index: number;
  select: (val: string, index: number) => void;
  changePrice: (val: string, index: number) => void;
  market: boolean;
  limitPrice: string;
}

const LimitOrMarket: React.FC<IProps> = ({
  index,
  select,
  changePrice,
  market,
  limitPrice,
}) => {
  const handleSelect = (e: RadioButtonChangeEvent) => {
    select(e.value, index);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    changePrice(e.target.value, index);
  };

  const marketId = `marketId-${index}`;
  const limitId = `limitId-${index}`;

  return (
    <td>
      <RadioButton
        inputId={marketId}
        name={`orderType-${index}`} // ensures buttons are grouped correctly
        value="market"
        onChange={handleSelect}
        checked={market}
      />
      <label htmlFor={marketId} className="p-radiobutton-label">
        Market
      </label>
      <br />

      <RadioButton
        inputId={limitId}
        name={`orderType-${index}`} // same group name
        value="limit"
        onChange={handleSelect}
        checked={!market}
      />
      <label htmlFor={limitId} className="p-radiobutton-label">
        Limit
      </label>
      <br />

      {!market && (
        <span>
          <label>% of market value</label>
          <InputText onChange={handlePriceChange} value={limitPrice} />
        </span>
      )}
    </td>
  );
};

export default LimitOrMarket;
