import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import Landing from "./landing-page";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<Landing />);
} else {
  console.error("Root element not found");
}
