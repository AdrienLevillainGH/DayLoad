import React from "react";
import { createRoot } from "react-dom/client";
import DayLoad from "./DayLoad.jsx";
import { requestPersistence } from "./storage.js";
import "./index.css";

requestPersistence();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DayLoad />
  </React.StrictMode>
);
