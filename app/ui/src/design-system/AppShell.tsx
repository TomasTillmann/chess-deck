import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { routeFromHash } from "../routing";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ThemeSelector } from "./ThemeSelector";
import type { ThemeProps } from "./theme";

export function AppShell({ children, theme }: ThemeProps & { children: ReactNode }) {
  const menuId = useId();
  const menu = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState(routeFromHash);
  const inViews = route.view === "views" || (route.view === "practice" && !!route.viewId);

  useEffect(() => {
    const onRouteChange = () => {
      setRoute(routeFromHash());
      menu.current?.hidePopover();
    };
    window.addEventListener("hashchange", onRouteChange);
    return () => window.removeEventListener("hashchange", onRouteChange);
  }, []);

  return <div className="workspace" data-theme={theme}>
    <header className="workspace-header">
      <div className="workspace-brand">
        <Button variant="ghost" size="icon" className="navigation-toggle" aria-label="Navigation menu" aria-expanded={open} aria-controls={menuId} popoverTarget={menuId}>
          <Icon name="menu" size={22} />
        </Button>
        <span className="wordmark">Chess Deck<span className="wordmark-dot" aria-hidden="true" /></span>
      </div>
      <nav id={menuId} ref={menu} className="workspace-navigation" aria-label="Main navigation" popover="auto" onToggle={event => setOpen(event.newState === "open")}>
        <a href="#/" aria-current={!inViews && route.view !== "statistics" ? "page" : undefined} onClick={() => menu.current?.hidePopover()}>Decks</a>
        <a href="#/views" aria-current={inViews ? "page" : undefined} onClick={() => menu.current?.hidePopover()}>Deck Views</a>
        <a href="#/statistics" aria-current={route.view === "statistics" ? "page" : undefined} onClick={() => menu.current?.hidePopover()}>Statistics</a>
      </nav>
      <ThemeSelector />
    </header>
    {children}
  </div>;
}
