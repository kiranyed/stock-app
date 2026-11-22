import { Dialog } from "primereact/dialog";
import * as React from "react";
import { ReactNode } from "react";
import DialogFooter from "./dialog-footer";
export default function DeleteDialog(props: {
  visible: boolean;
  hide: () => void;
  delete: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      visible={props.visible}
      style={{ width: "450px" }}
      header="Confirm"
      modal
      footer={<DialogFooter handleYes={props.delete} handleNo={props.hide} />}
      onHide={props.hide}
    >
      {props.children}
    </Dialog>
  );
}
