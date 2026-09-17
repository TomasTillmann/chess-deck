import type { ReactNode, Ref } from "react";
import type { ThemeProps } from "./theme";

export function PageHeader({ title, children, actions, headingRef, theme }: ThemeProps & { title: string; children?: ReactNode; actions?: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  return <header className="deck-page-header" data-theme={theme}>
    <div><h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>{children ? <p>{children}</p> : null}</div>
    {actions}
  </header>;
}
