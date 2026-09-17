import { Icon } from "./Icon";
import { Theme, useTheme, type ThemeProps } from "./theme";

export function ThemeSelector({ theme: appearance }: ThemeProps) {
  const { theme, setTheme } = useTheme();
  return <label className="theme-selector" data-theme={appearance}>
    <Icon name={theme === Theme.Dark ? "moon" : "sun"} />
    <span className="visually-hidden">Theme</span>
    <span className="theme-select">
      <select value={theme} onChange={event => setTheme(event.target.value === Theme.Dark ? Theme.Dark : Theme.Light)}>
        <option value={Theme.Light}>Light</option>
        <option value={Theme.Dark}>Dark</option>
      </select>
      <Icon name="chevron-down" size={16} />
    </span>
  </label>;
}
