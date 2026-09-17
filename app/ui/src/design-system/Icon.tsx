import type { ThemeProps } from "./theme";

const paths = {
  menu: "M4 6h16M4 12h16M4 18h16",
  "chevron-left": "m14 6-6 6 6 6",
  "chevron-right": "m10 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  "arrow-left": "m12 5-7 7 7 7M5 12h14",
  first: "M5 5v14m13-13-6 6 6 6",
  last: "M19 5v14M6 6l6 6-6 6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z",
};

export function Icon({ name, size = 18, theme }: ThemeProps & { name: keyof typeof paths; size?: number }) {
  return <svg data-theme={theme} className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
