import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export enum Theme {
  Light = "light",
  Dark = "dark",
}

export type ThemeProps = { theme?: Theme };

const storageKey = "woodpecker.theme";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

function savedTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === Theme.Dark ? Theme.Dark : Theme.Light;
  } catch {
    return Theme.Light;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(savedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Theme selection still works when browser storage is unavailable.
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className="theme-root" data-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}
