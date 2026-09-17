---
name: "Chess Deck"
description: "A quiet workspace for chess practice and analysis."
colors:
  light-canvas: "#f4f5f1"
  light-surface: "#ffffff"
  light-surface-subtle: "#eaede7"
  light-surface-hover: "#e0e6dc"
  light-text: "#202720"
  light-text-muted: "#616b60"
  light-border: "#d7ddd3"
  light-border-strong: "#acb8a8"
  light-accent: "#365c41"
  light-accent-hover: "#264930"
  light-on-accent: "#ffffff"
  light-accent-soft: "#e3edde"
  light-success: "#2d633d"
  light-success-soft: "#e3efdf"
  light-warning: "#785319"
  light-warning-soft: "#f7edd9"
  light-danger: "#943f36"
  light-danger-soft: "#f8e7e2"
  light-info: "#2f5a85"
  light-info-soft: "#e2edf7"
  light-focus: "#466dba"
  light-selection: "#d2e5ce"
  light-board-light: "#e6e2cc"
  light-board-dark: "#92a080"
  light-board-coordinate: "#253021"
  light-board-last-move: "#d3ce5880"
  light-board-selected: "#526e6090"
  dark-canvas: "#161512"
  dark-surface: "#262421"
  dark-surface-subtle: "#2c2926"
  dark-surface-hover: "#3c3934"
  dark-text: "#bababa"
  dark-text-muted: "#949494"
  dark-border: "#404040"
  dark-border-strong: "#666666"
  dark-accent: "#3692e7"
  dark-accent-hover: "#6caaed"
  dark-on-accent: "#161512"
  dark-accent-soft: "#263f57"
  dark-success: "#89b35b"
  dark-success-soft: "#262421"
  dark-warning: "#cfa155"
  dark-warning-soft: "#262421"
  dark-danger: "#d96666"
  dark-danger-soft: "#262421"
  dark-info: "#3692e7"
  dark-info-soft: "#161512"
  dark-focus: "#3692e7"
  dark-selection: "#263f57"
  dark-board-light: "#f0d9b5"
  dark-board-dark: "#b58863"
  dark-board-coordinate: "#161512"
  dark-board-last-move: "#9bc70069"
  dark-board-selected: "#14551e80"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.75rem"
    lineHeight: 1.45
rounded:
  control: "6px"
  panel: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.light-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-success:
    backgroundColor: "{colors.light-success-soft}"
    textColor: "{colors.light-success}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-warning:
    backgroundColor: "{colors.light-warning-soft}"
    textColor: "{colors.light-warning}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.light-danger-soft}"
    textColor: "{colors.light-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  theme-select:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.control}"
    padding: "0 34px 0 12px"
    height: "34px"
  deck-card:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.panel}"
    padding: "{spacing.5}"
  notation-navigation:
    backgroundColor: "{colors.light-surface-subtle}"
    textColor: "{colors.light-text}"
    height: "42px"
  notation-current-move:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-on-accent}"
    padding: "1px 6px"
---

# Design System: Chess Deck

## Overview

**Creative North Star: "The Chess Workspace"**

Chess Deck is a quiet, functional chess workspace. The light theme pairs chalk surfaces with restrained sage accents; the Lichess-based dark theme pairs warm charcoal surfaces with blue accents and a brown board. System typography, flat bordered panels, and compact controls support repeated practice.

**Key Characteristics:**

- The board is the visual focus.
- One shared palette vocabulary serves light and dark themes.
- Borders and surface tones establish hierarchy.
- Review controls keep a stable position below the board.

This document records the implemented UI. `src/design-system/tokens.css` is the runtime source of truth; regenerate this frontmatter and `.impeccable/design.json` when its values change. Color keys pair a theme prefix with the CSS token name. Component frontmatter describes the default light palette; runtime CSS variables select the inherited palette. The sidecar’s derived tonal ramps are inspection aids, not additional runtime tokens.

## Colors

### Primary

Accent tokens identify primary actions, the current notation move, and recommended practice: sage in light mode and blue in dark mode. `accent-hover`, `on-accent`, and `accent-soft` supply their related states.

### Neutral

`canvas` is the page ground; `surface` is the card and panel fill. `surface-subtle` groups supporting content and `surface-hover` marks interactive feedback. `text` and `text-muted` separate primary content from metadata. `border` and `border-strong` divide surfaces and notation branches.

### Semantic and board colors

`success`, `warning`, `danger`, and `info` have matching soft fills. They communicate review ratings and result states; keep accompanying text. `focus` is the keyboard outline and `selection` is text selection. The `board-*` tokens own square colors, coordinates, last moves, and selected squares in both live boards and FEN previews.

The dark palette follows the neutrals and primary color in the [Lichess default theme](https://github.com/lichess-org/lila/blob/master/ui/lib/css/theme/_theme.default.scss) and its [default brown board](https://github.com/lichess-org/lila/blob/master/public/images/board/brown.png). Semantic rating text uses lighter tints of Lichess’s good, warning, and bad colors for compact-control contrast.

**The Theme Boundary Rule.** An explicit component theme overrides its subtree through CSS inheritance; descendants without a theme follow their nearest boundary.

## Typography

The UI uses the local system font stack in `font-ui`; no font download is required. Page headings use the headline role, deck names use title, descriptions use body, controls use label, and position metadata uses caption. Mobile deck headings use headline-small. Move numbers and coverage scores use tabular numerals.

The type scale in the frontmatter records existing roles. Keep chess notation readable alongside the board and avoid introducing a separate display face.

## Layout

Deck pages use a centered maximum width of 1120px. The library has two columns, with preview and copy arranged horizontally inside cards; below 1000px cards stack internally. At 560px and below, the library becomes one column and each library card returns to a compact horizontal arrangement. Position grids fill available width with columns of at least 180px, then use two columns at the mobile breakpoint.

The library places a **Practice All** action above the Decks heading. It opens the shared solver at `#/practice`; it is not presented as another deck card.

The header's three-line navigation button opens a native popover with **Decks** (`#/`) and **Deck Views** (`#/views`). The current section is highlighted, including its practice routes. The popover overlays content without moving it and closes on selection, outside click, Escape, or a route change. At narrow widths the decorative theme icon is hidden to preserve room for both controls and the wordmark.

Saved views occupy their own page, using the same centered page width and heading as Decks. Each row offers Practice, Rename, and Delete; deletion requires confirmation. Saved-view practice returns to Deck Views, while Practice All returns to Decks.

The solver places a square board beside a 220–280px analysis panel, separated by 24px. The board is capped at 720px and desktop sizing responds to viewport height. At 900px and below, analysis moves beneath the board with a 220px panel height. At 560px and below, page gutters are 18px and the header is 58px high instead of 68px.

Use the shared spacing scale for repeated gaps and padding. The submit/rating row reserves the rating group before reveal with `visibility: hidden`; its three equal rating columns remain in place. Feedback has a reserved row below it.

## Elevation & Depth

Ordinary cards, board surfaces, and analysis panels are flat. Borders and subtle fills communicate containment and selection. Only the notation context menu uses `shadow-menu`, with a theme-specific value recorded in the sidecar. Keyboard focus uses a separate outline, not elevation.

## Shapes

Controls and the live board use the control radius; cards and the analysis panel use the panel radius. FEN previews have a small clipped corner (3px), and notation move buttons use compact corners (4px). The square board is the recurring geometric anchor.

## Components

### Theme API

`Theme`, `ThemeProvider`, `useTheme`, and `ThemeProps` are exported from `src/design-system/index.ts`. `Theme.Light` is `"light"`; `Theme.Dark` is `"dark"`. The provider wraps the app once in `main.tsx`, applies `data-theme` to its wrapper and the document element, and persists selection under `woodpecker.theme`. Missing, invalid, or unavailable storage falls back to light. Selection still works in memory when storage cannot be written.

```tsx
import { Button, Theme, ThemeProvider, AppShell } from "./design-system";

<ThemeProvider>
  <AppShell>
    <Button variant="primary">Submit</Button>
    <Button theme={Theme.Dark}>Dark appearance</Button>
  </AppShell>
</ThemeProvider>
```

Public visual components accept `theme?: Theme`: the shared primitives, `DeckCard`, `DeckGrid`, `DeckPositionGrid`, `SolverPage`, `ChessBoard`, `FenPreview`, `MoveNotationPanel`, and `ReviewPanel`. Omit the prop for inheritance. This prop changes appearance, not global selection or component behavior. `ThemeSelector` requires a provider; its optional theme changes its appearance while its value continues to reflect the global selection.

To add a theme:

1. Add its string member to the `Theme` enum in `theme.tsx`.
2. Add a `[data-theme="..."]` block in `tokens.css` defining every palette token, `shadow-menu`, and the appropriate `color-scheme`.
3. Update stored-value validation in `savedTheme()` and the options/change handling in `ThemeSelector.tsx`; both currently distinguish only light and dark.
4. Extend theme behavior checks, inspect all three screens in the new palette, and refresh this document and its sidecar.

### Shared primitives

| Component | API and responsibility |
| --- | --- |
| `Button` | Native button props; `variant="primary\|secondary\|ghost\|success\|warning\|danger"`; `size="default\|icon\|compact"`. Defaults to secondary, default size, and `type="button"`. |
| `Icon` | `name="menu\|chevron-left\|chevron-right\|chevron-down\|arrow-left\|first\|last\|sun\|moon"`; optional numeric `size` (18 by default). Decorative SVG; put the accessible name on its control. |
| `PageHeader` | Required `title`, optional description as `children`, optional `actions` and `headingRef` for restoring focus. Provides the deck-page heading arrangement. |
| `StatusMessage` | Native span props and `tone="muted\|success\|warning\|danger\|info"`; defaults to muted. The caller supplies live-region semantics where needed. |
| `AppShell` | Application navigation, wordmark, theme selector, and children. |
| `ThemeSelector` | Labeled native select for the provider's current theme, with a fixed width and decorative chevron. Supporting browsers use a themed `base-select` picker anchored below the control; other browsers retain their native menu. |

Buttons have a shared minimum height of 38px, explicit hover/active states, and a disabled state. Icon buttons are square; compact buttons reduce height and padding. Color/border transitions use `motion-fast` and `ease-out`; reduced-motion preferences disable CSS transitions. All focusable controls receive a visible focus outline.

```tsx
import { Button, Icon, PageHeader, StatusMessage } from "./design-system";

<Button variant="ghost" size="icon" aria-label="Previous position">
  <Icon name="chevron-left" />
</Button>
<StatusMessage tone="danger" role="status">Couldn’t save review.</StatusMessage>
<PageHeader title="Decks" actions={<Button>Go to decks</Button>}>
  2 decks available
</PageHeader>
```

### Chess-specific patterns

`DeckCard` takes `fen`, `label`, `onClick`, optional `children`, and the boolean `position` / `recommended` flags. It composes a native button with the shared `FenPreview`; the position variant changes density and the recommended variant uses the accent border and soft fill. Deck and position grids own the data mapping and callbacks.

`ChessBoard` adapts Chessground without owning game state. `MoveNotationPanel` displays the move tree, current move, review annotations, navigation controls, and move context menu. Current notation uses the accent fill; missing solution moves use information colors and extra analysis uses subdued colors.

`ReviewPanel` renders Easy, Hard, and Didn’t solve using success, warning, and danger button variants. It retains its save/retry and next-position flow while reserving layout space before a solution is revealed. `SolverPage` composes these pieces and renders loading, coverage, save, and provisional-solution feedback.

`PracticePage` reuses `SolverPage` for an ephemeral view over current source decks. Its optional `collections?: readonly string[]` limits the scope for future multiselect; omission means all decks. Each next-review request refreshes the catalog and asks the backend for a uniformly random due card across the scope, falling back to a new card. Reviews retain their source deck and FEN identity and share the same persistence as individual-deck practice; the view creates no deck or separate review state. Source editing stays in individual decks, with Save solution hidden in this view. When no eligible card remains, the page shows the next due time and refreshes on focus or when a card becomes due.

### Source responsibilities

| Source | Responsibility |
| --- | --- |
| `src/design-system/tokens.css` | Both palettes; typography, spacing, radius, size, and motion tokens. |
| `src/design-system/components.css` | Global base styles, shared controls, header, focus, and reduced motion. |
| `src/design-system/*.tsx` | Small visual primitives and global theme selection. |
| `src/App.css` | Deck, solver, board, notation, rating, and responsive layout styles using tokens. |
| `src/components/`, `src/pages/SolverPage.tsx` | Feature presentation and user interaction wiring. |
| `src/pages/PracticePage.tsx` | Temporary all/selected-deck practice scope, catalog refresh, and progression using source-card review identities. |
| `src/hooks/usePuzzleSolver.ts` | Chess state, move-tree edits, submission, comparison, and solution updates. |
| `src/hooks/useReviewQueue.ts` | Schedule loading, focus/time refresh, derived counts, and recommendation. |
| `src/App.tsx`, `src/routing.ts` | Deck loading and hash-route selection/navigation. |
| `src/gameTree.ts`, `src/solutionComparison.ts`, `src/*Client.ts` | Domain operations, comparison, and API boundaries. |

## Do's and Don'ts

### Do:

- Do use semantic tokens and shared components for new controls.
- Do let descendants inherit a theme unless an explicit local appearance is needed.
- Do retain native control semantics, visible focus, and accessible labels.
- Do keep review ratings compact and reserve their space before reveal.

### Don't:

- Don’t add raw palette colors to page or component styles.
- Don’t duplicate the theme state in individual components.
- Don’t use decorative shadows on ordinary panels or cards.
- Don’t change chess, review, routing, or server behavior through presentation components.
