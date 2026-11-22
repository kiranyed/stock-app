import { Button } from "primereact/button";
import * as React from "react";
export default function DialogFooter(props: {
  handleYes: () => void;
  handleNo: () => void;
}) {
  return (
    <span>
      <Button
        label="No"
        icon="pi pi-times"
        className="p-button-text"
        onClick={props.handleNo}
      />
      <Button
        label="Yes"
        icon="pi pi-check"
        className="p-button-text"
        onClick={props.handleYes}
      />
    </span>
  );
}
