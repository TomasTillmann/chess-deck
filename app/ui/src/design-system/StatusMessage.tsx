import type { ComponentProps } from "react";
import type { ThemeProps } from "./theme";

export function StatusMessage({ tone = "muted", theme, className = "", ...props }: ComponentProps<"span"> & ThemeProps & { tone?: "muted" | "success" | "warning" | "danger" | "info" }) {
  return <span {...props} data-theme={theme} className={`ui-status ui-status--${tone} ${className}`} />;
}
