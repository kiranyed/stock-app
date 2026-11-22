import * as React from "react";
export default function DialogBody(props: { message: string }) {
  return (
    <div className="confirmation-content">
      <i
        className="pi pi-exclamation-triangle mr-3"
        style={{ fontSize: "2rem" }}
      />
      <span>{props.message}</span>
    </div>
  );
}
