import * as React from "react";
import { Checkbox } from "primereact/checkbox";
import { IPosition } from "../shared/trading-types";

interface IProps {
  position: IPosition;
  index: number;
  select: (index: number) => void;
}

const Position: React.FC<IProps> = ({ position, index, select }) => {
  const onSelect = () => {
    select(index);
  };

  return (
    <tr>
      <td>
        <Checkbox onChange={onSelect} checked={position.selected}></Checkbox>
        {position.selected.toString()}
      </td>
      <td>{position.instrument.symbol}</td>
      <td>{position.longQuantity}</td>
      <td>
        {position.longQuantity && position.longQuantity * position.averagePrice}
      </td>
      <td>{position.marketValue}</td>
    </tr>
  );
};

export default Position;
