/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles/globals.css";
import "./styles/ats.css";
import "./styles/assistant-batch.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
