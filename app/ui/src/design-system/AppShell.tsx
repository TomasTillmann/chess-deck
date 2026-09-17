import type { ReactNode } from "react";
import { ThemeSelector } from "./ThemeSelector";
import type { ThemeProps } from "./theme";

export function AppShell({ children, theme }: ThemeProps & { children: ReactNode }) {
  return <div className="workspace" data-theme={theme}>
    <header className="workspace-header">
      <span className="wordmark">Chess Deck<span className="wordmark-dot" aria-hidden="true" /></span>
      <ThemeSelector />
    </header>
    {children}
  </div>;
}
