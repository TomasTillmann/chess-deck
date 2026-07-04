import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startServerHealthcheckLoop } from "./serverHealthcheck";

startServerHealthcheckLoop();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
