import React from "react";
import ReactDOM from "react-dom/client";
import PromptWindow from "./PromptWindow";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PromptWindow />
  </React.StrictMode>,
);
