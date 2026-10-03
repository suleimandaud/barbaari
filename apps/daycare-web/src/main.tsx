import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// After styles.css so the design system wins over Tailwind's preflight reset.
import "@barbaari/shared/web/barbaari.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
