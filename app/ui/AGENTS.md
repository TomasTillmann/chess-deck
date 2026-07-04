# UI Agent Notes

This folder is the React/Vite frontend for Woodpecker. It has Playwright installed so agents can visually verify UI work.

## Commands

- Install dependencies: `npm install`
- Start the app: `npm run dev`
- Build check: `npm run build`
- Playwright smoke/e2e check: `npm run test:e2e`

Playwright is configured in `playwright.config.ts`. The test runner automatically starts Vite at `http://127.0.0.1:5173`, so prefer `npm run test:e2e` over manually starting a server for routine checks.

For the Docker Compose app, the UI is also exposed on host port `5173`, but it is
served by nginx from the production build. See `../AGENTS.md` for full-app
commands and port notes.

## When Implementing UI Changes

- Use Playwright after frontend changes that affect layout, rendering, interaction, board behavior, or visible state.
- Add or update focused tests in `tests/` when adding new UI behavior.
- For visual inspection, create a small temporary or committed Playwright test that navigates to the relevant screen and captures/asserts the state. Keep committed tests stable and user-observable.
- Run `npm run build` before finishing changes unless the task is only documentation.

## Current Baseline

- `tests/smoke.spec.ts` verifies that the app loads, the Woodpecker heading is visible, and Chessground renders pieces.
- Playwright browser binaries may need to be installed on a fresh machine with `npx playwright install chromium`.
