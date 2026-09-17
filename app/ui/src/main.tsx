import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppShell, ThemeProvider } from "./design-system";
import { startServerHealthcheckLoop } from "./serverHealthcheck";

startServerHealthcheckLoop();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider><AppShell><App /></AppShell></ThemeProvider>
  </StrictMode>,
);
