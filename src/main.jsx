import React from "react";
import { createRoot } from "react-dom/client";
import DayLoad from "./DayLoad.jsx";
import { requestPersistence } from "./storage.js";
import { handleRedirect } from "./coros.js";
import "./index.css";

requestPersistence();

// COROS sends the browser back here with ?code=… after you authorise.
// Finish that exchange before the app paints, so it starts up linked.
handleRedirect()
  .catch(() => null)
  .then(() => {
    createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <DayLoad />
      </React.StrictMode>
    );
  });
