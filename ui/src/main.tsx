import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createLegalMoveEngine } from "./engine/legalMoveEngine";
import { stockfishEngine } from "./engine/stockfishClient";
import type { Engine } from "./engine/types";
import { startServerHealthcheckLoop } from "./serverHealthcheck";

declare global {
  interface Window {
    __woodpeckerEngine?: Engine;
  }
}

function createAppEngine(): Engine {
  const engineName = new URLSearchParams(window.location.search).get("engine");

  return window.__woodpeckerEngine ?? (engineName === "legal" ? createLegalMoveEngine() : stockfishEngine);
}

const engine = createAppEngine();

startServerHealthcheckLoop();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App engine={engine} />
  </StrictMode>,
);
