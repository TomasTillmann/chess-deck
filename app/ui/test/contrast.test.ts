import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokens = read("../src/design-system/tokens.css");
const app = read("../src/App.css");
const components = read("../src/design-system/components.css");

function declaration(css: string, selectors: string[], property: string) {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].reverse();
  for (const selector of selectors) {
    for (const [, names, body] of rules) {
      if (!names.split(",").some(name => name.trim() === selector)) continue;
      const value = body.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))?.[1].trim();
      if (value) return value;
    }
  }
  throw new Error(`Missing ${property} in ${selectors.join(", ")}`);
}

function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  return hex.slice(1).match(/../g)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

for (const theme of ["light", "dark"]) {
  const color = (css: string, selectors: string[], property = "color") => {
    const value = declaration(css, selectors, property);
    const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
    return token ? declaration(tokens, [`[data-theme="${theme}"]`], token) : value;
  };
  const cases = [
    ["selected library description", app,
      [".library-deck.is-selected .deck-card-description", ".deck-card-description"],
      [".library-deck.is-selected .deck-card"]],
    ["recommended new status", app,
      [".position-card.is-recommended .position-card-status", ".position-card-status"],
      [".ui-button.position-card.is-recommended"]],
    ["recommended due status", app,
      [".position-card.is-recommended .position-card-status.is-due", ".position-card-status.is-due"],
      [".ui-button.position-card.is-recommended"]],
    ["danger control", components, [".ui-button--danger"], [".ui-button--danger"]],
  ] as const;

  for (const [name, css, foreground, background] of cases) {
    test(`${theme} ${name} has at least 4.5:1 contrast`, () => {
      const fg = color(css, [...foreground]);
      const bg = color(css, [...background], "background");
      const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
    });
  }
}
