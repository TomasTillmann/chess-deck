import { expect, test, type Page } from "@playwright/test";

const fen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const viewId = "27b564f9-e0d3-4778-bc41-1a36bcdd1ba2";
const serverNow = "2026-09-16T12:00:00.000Z";
const view = { id: viewId, name: "Morning tactics", collections: ["alpha"], createdAt: serverNow, updatedAt: serverNow };

async function mockNavigation(page: Page) {
  await page.route("**/v1/collections", route => route.fulfill({ json: {
    collections: [{ slug: "alpha", name: "Alpha", fens: [fen] }],
  } }));
  await page.route("**/v1/deck-views**", route => route.fulfill({ json:
    new URL(route.request().url()).pathname === "/v1/deck-views" ? { views: [view] } : view,
  }));
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: {
    serverNow, cards: [{ fen, status: "new", dueAt: null }], recommendedFen: fen, nextDueAt: null,
  } }));
  await page.route("**/v1/practice-queue?*", route => route.fulfill({ json: {
    serverNow, cards: [{ collection: "alpha", fen, status: "new", dueAt: null }],
    recommendedCard: { collection: "alpha", fen }, recommendedFen: fen, nextDueAt: null,
  } }));
  await page.route("**/v1/solution/**", route => route.fulfill({ json: {
    fen, sideToSolve: "b", status: "solved",
    root: { fen, turn: "b", moves: [{ uci: "f4d3", children: [{ moves: [] }] }] },
  } }));
}

function navigation(page: Page) {
  return {
    trigger: page.getByRole("button", { name: "Navigation menu", exact: true }),
    menu: page.getByRole("navigation", { name: "Main navigation", exact: true }),
  };
}

test("Decks and Deck Views stay separate through navigation, reload, and browser history", async ({ page }) => {
  await mockNavigation(page);
  await page.goto("/");
  const { trigger, menu } = navigation(page);
  await expect(page.getByRole("heading", { name: "Decks", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deck Views", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Practice Morning tactics", exact: true })).toHaveCount(0);
  await trigger.click();
  const decks = menu.getByRole("link", { name: "Decks", exact: true });
  const views = menu.getByRole("link", { name: "Deck Views", exact: true });
  await expect(decks).toHaveAttribute("href", "#/");
  await expect(decks).toHaveAttribute("aria-current", "page");
  await expect(views).toHaveAttribute("href", "#/views");
  await views.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/#\/views$/);
  await expect(page.getByRole("heading", { name: "Deck Views", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select Alpha", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Practice All", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Practice Morning tactics", exact: true })).toBeVisible();
  await trigger.click();
  await expect(views).toHaveAttribute("aria-current", "page");
  await decks.click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "Decks", exact: true, level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Deck Views", exact: true, level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Decks", exact: true, level: 1 })).toBeVisible();
  await expect(menu).toBeHidden();
});

test("navigation supports keyboard, Escape and outside dismissal without shifting content", async ({ page }) => {
  await mockNavigation(page);
  await page.goto("/");
  const { trigger, menu } = navigation(page);
  const heading = page.getByRole("heading", { name: "Decks", exact: true, level: 1 });
  await expect(heading).toBeVisible();
  const headerBox = await page.getByRole("banner").boundingBox();
  const headingBox = await heading.boundingBox();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  expect(await trigger.getAttribute("aria-controls")).toBe(await menu.getAttribute("id"));
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "Decks", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "Deck Views", exact: true })).toBeFocused();
  expect(await page.getByRole("banner").boundingBox()).toEqual(headerBox);
  expect(await heading.boundingBox()).toEqual(headingBox);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await heading.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await heading.boundingBox()).toEqual(headingBox);
});

test("the shared header links each practice route to its correct section", async ({ page }) => {
  await mockNavigation(page);
  const { trigger, menu } = navigation(page);
  for (const [path, section] of [
    ["#/decks/alpha", "Decks"],
    ["#/decks/alpha/positions/1", "Decks"],
    ["#/practice", "Decks"],
    [`#/views/${viewId}/practice`, "Deck Views"],
  ]) {
    await page.goto(`/${path}`);
    await expect(page.getByRole("banner").getByText("Chess Deck", { exact: true })).toBeVisible();
    await trigger.click();
    await expect(menu.getByRole("link", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Go to deck views", exact: true }).click();
  await expect(page).toHaveURL(/#\/views$/);
  await page.goto("/#/practice");
  await page.getByRole("button", { name: "Go to decks", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("Deck Views loads while the initial deck catalog is pending and remains usable if it fails", async ({ page }) => {
  await mockNavigation(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/v1/collections", async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: "Temporary failure" } });
  });
  await page.goto("/#/views");
  await expect(page.getByRole("heading", { name: "Deck Views", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice Morning tactics", exact: true })).toBeVisible();
  const failedCatalog = page.waitForResponse(response => response.url().endsWith("/v1/collections"));
  release();
  await failedCatalog;
  const { trigger, menu } = navigation(page);
  await trigger.click();
  await menu.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(/Failed to load collections/)).toBeVisible();
  await trigger.click();
  await menu.getByRole("link", { name: "Deck Views", exact: true }).click();
  await expect(page.getByRole("button", { name: "Practice Morning tactics", exact: true })).toBeVisible();
});

test("navigation fits narrow and wide headers in both themes", async ({ page }) => {
  await mockNavigation(page);
  await page.goto("/#/views");
  const { trigger, menu } = navigation(page);
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const value of ["light", "dark"]) {
      await theme.selectOption(value);
      const headerBox = await page.getByRole("banner").boundingBox();
      const triggerBox = await trigger.boundingBox();
      const selectorBox = await theme.boundingBox();
      if (!triggerBox || !selectorBox) throw new Error("Expected visible header controls");
      expect(triggerBox.x + triggerBox.width <= selectorBox.x || selectorBox.x + selectorBox.width <= triggerBox.x).toBe(true);
      await trigger.click();
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      if (!menuBox) throw new Error("Expected visible navigation");
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
      expect(await menu.evaluate(element => getComputedStyle(element).colorScheme)).toBe(value);
      expect(await page.getByRole("banner").boundingBox()).toEqual(headerBox);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }
  }
});
