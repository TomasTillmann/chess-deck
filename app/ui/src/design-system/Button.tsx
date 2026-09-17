import type { ComponentProps } from "react";
import type { ThemeProps } from "./theme";

type ButtonProps = ComponentProps<"button"> & ThemeProps & {
  variant?: "primary" | "secondary" | "ghost" | "success" | "warning" | "danger";
  size?: "default" | "icon" | "compact";
};

export function Button({ theme, variant = "secondary", size = "default", className = "", type = "button", ...props }: ButtonProps) {
  return <button {...props} type={type} data-theme={theme} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} />;
}
