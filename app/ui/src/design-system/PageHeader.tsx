import type { ReactNode } from "react";
import type { ThemeProps } from "./theme";

export function PageHeader({ title, children, actions, theme }: ThemeProps & { title: string; children?: ReactNode; actions?: ReactNode }) {
  return <header className="deck-page-header" data-theme={theme}>
    <div><h1>{title}</h1>{children ? <p>{children}</p> : null}</div>
    {actions}
  </header>;
}
