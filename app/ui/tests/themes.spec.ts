import { expect, test, type Page } from "@playwright/test";

const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";

async function mockPractice(page: Page) {
  await page.route("**/v1/collections", route => route.fulfill({ json: {
    collections: [{ slug: "woodpecker", name: "Woodpecker", description: "Practice deck", fens: [firstFen, secondFen] }],
  } }));
  await page.route("**/v1/solution/**", route => route.fulfill({ json: {
    fen: firstFen,
    sideToSolve: "b",
    status: "solved",
    root: { fen: firstFen, turn: "b", moves: [{ uci: "f4d3", children: [{ moves: [] }] }] },
  } }));
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: {
    serverNow: "2026-09-16T12:00:00.000Z",
    cards: [
      { fen: firstFen, status: "new", dueAt: null },
      { fen: secondFen, status: "new", dueAt: null },
    ],
    recommendedFen: secondFen,
    nextDueAt: null,
  } }));
}

async function rootAppearance(page: Page) {
  return page.locator(".theme-root").evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, scheme: style.colorScheme };
  });
}

test("theme selection changes actual colors and persists through routes and reloads", async ({ page }) => {
  await mockPractice(page);
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(theme).toHaveValue("light");
  await expect(page.locator(".theme-root")).toHaveAttribute("data-theme", "light");
  const light = await rootAppearance(page);
  expect(light.scheme).toBe("light");

  await theme.selectOption("dark");
  await expect(page.locator(".theme-root")).toHaveAttribute("data-theme", "dark");
  const dark = await rootAppearance(page);
  expect(dark.scheme).toBe("dark");
  expect(dark.background).not.toBe(light.background);
  expect(dark.color).not.toBe(light.color);
  expect(dark.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(await page.evaluate(() => localStorage.getItem("woodpecker.theme"))).toBe("dark");

  await page.getByRole("button", { name: /Woodpecker/ }).click();
  await expect(page.getByRole("heading", { name: "Woodpecker", exact: true })).toBeVisible();
  await expect(theme).toHaveValue("dark");
  expect(await rootAppearance(page)).toEqual(dark);
  await page.getByRole("button", { name: "Position 1", exact: true }).click();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(theme).toHaveValue("dark");
  await page.reload();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(theme).toHaveValue("dark");
  expect(await rootAppearance(page)).toEqual(dark);
  await theme.selectOption("light");
  expect(await rootAppearance(page)).toEqual(light);
  await page.reload();
  await expect(theme).toHaveValue("light");
  expect(await rootAppearance(page)).toEqual(light);
});

test("switching themes preserves moves, submitted results, and the rating retry attempt", async ({ page }) => {
  await mockPractice(page);
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/v1/reviews", route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    attempts.push(payload);
    return attempts.length === 1
      ? route.fulfill({ status: 503, json: { error: "Temporary failure" } })
      : route.fulfill({ json: {
        ...payload,
        dueAt: "2026-09-17T12:00:00.000Z",
        intervalDays: 1,
        scheduleUnchanged: false,
        repetitions: 1,
        lapses: 0,
      } });
  });
  await page.goto("/#/decks/woodpecker/positions/1");
  const board = page.getByLabel("Chess position");
  await expect(board).toBeVisible();
  const boardElement = await board.elementHandle();
  const box = await board.boundingBox();
  if (!box || !boardElement) throw new Error("Expected chess board");
  // Black orientation: f4 is column 3 / row 4, and d3 is column 5 / row 3.
  await page.mouse.move(box.x + box.width * 2.5 / 8, box.y + box.height * 3.5 / 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 4.5 / 8, box.y + box.height * 2.5 / 8, { steps: 12 });
  await page.mouse.up();
  const move = page.getByLabel("Move notation").getByRole("button", { name: "Nd3", exact: true });
  await expect(move).toHaveAttribute("aria-current", "step");
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await theme.selectOption("dark");
  expect(await boardElement.evaluate(element => element.isConnected)).toBe(true);
  await expect(move).toHaveAttribute("aria-current", "step");
  await expect(board).toHaveClass(/orientation-black/);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("100% coverage", { exact: true })).toBeVisible();
  await theme.selectOption("light");
  await expect(page.getByText("100% coverage", { exact: true })).toBeVisible();
  await expect(move).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await theme.selectOption("dark");
  await expect(page.getByText("100% coverage", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hard", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/2$/);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(theme).toHaveValue("dark");
});

test("invalid stored themes fall back to Light and the selector works by keyboard", async ({ page }) => {
  await mockPractice(page);
  await page.addInitScript(() => localStorage.setItem("woodpecker.theme", "invalid-theme"));
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(theme).toHaveValue("light");
  await theme.focus();
  await expect(theme).toBeFocused();
  await page.keyboard.press("d");
  await page.keyboard.press("Enter");
  await expect(theme).toHaveValue("dark");
  await expect(page.locator(".theme-root")).toHaveAttribute("data-theme", "dark");
});

test("theme menu opens below its control without shifting the header", async ({ page }) => {
  await mockPractice(page);
  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Theme", exact: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await selector.selectOption(theme);
      const control = await selector.boundingBox();
      const header = await page.getByRole("banner").boundingBox();
      if (!control) throw new Error("Expected theme selector");
      await selector.click();
      for (const label of ["Light", "Dark"]) {
        const option = page.getByRole("option", { name: label, exact: true });
        await expect(option).toBeVisible();
        const box = await option.boundingBox();
        if (!box) throw new Error("Expected visible theme option");
        expect(box.y).toBeGreaterThan(control.y + control.height);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(await selector.boundingBox()).toEqual(control);
      expect(await page.getByRole("banner").boundingBox()).toEqual(header);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("option", { name: "Light", exact: true })).toBeHidden();
      await expect(selector).toBeFocused();
      await expect(selector).toHaveValue(theme);
      await selector.click();
      await page.getByRole("option", { name: theme === "light" ? "Dark" : "Light", exact: true }).click();
      await expect(selector).toHaveValue(theme === "light" ? "dark" : "light");
      expect(await selector.boundingBox()).toEqual(control);
    }
  }
});

test("blocked storage does not prevent theme selection", async ({ page }) => {
  await mockPractice(page);
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"]) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new DOMException("Storage blocked", "SecurityError"); } });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(page.getByRole("heading", { name: "Decks", exact: true })).toBeVisible();
  await expect(theme).toHaveValue("light");
  await theme.selectOption("dark");
  await expect(theme).toHaveValue("dark");
  expect((await rootAppearance(page)).scheme).toBe("dark");
  expect(errors).toEqual([]);
});

test("component Theme enum overrides isolate colors while unthemed descendants inherit", async ({ page }) => {
  await mockPractice(page);
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Theme", exact: true })).toBeVisible();
  // Mount a test-only composition using the public components; no demo route is shipped.
  await page.evaluate(async () => {
    const reactPath = "/node_modules/.vite/deps/react.js";
    const domPath = "/node_modules/.vite/deps/react-dom_client.js";
    const systemPath = "/src/design-system/index.ts";
    const [{ default: { createElement } }, { default: { createRoot } }, { Theme, Button, PageHeader, Icon }] = await Promise.all([
      import(reactPath), import(domPath), import(systemPath),
    ]);
    const host = document.createElement("div");
    host.id = "theme-component-check";
    document.querySelector(".theme-root")!.append(host);
    createRoot(host).render(createElement("div", null,
      createElement(PageHeader, {
        title: "Dark component",
        theme: Theme.Dark,
        actions: createElement("div", null,
          createElement(Button, { id: "inherited-dark" }, "Inherited dark"),
          createElement(Button, { id: "explicit-dark", theme: Theme.Dark }, "Explicit dark"),
          createElement(Button, { id: "explicit-light", theme: Theme.Light }, "Explicit light"),
          createElement("span", { id: "icon-light" }, createElement(Icon, { name: "sun", theme: Theme.Light })),
        ),
      }),
      createElement(Button, { id: "inherited-root" }, "Inherited root"),
    ));
  });
  const inheritedDark = page.locator("#inherited-dark");
  const explicitDark = page.locator("#explicit-dark");
  const explicitLight = page.locator("#explicit-light");
  const inheritedRoot = page.locator("#inherited-root");
  await expect(inheritedDark).toBeVisible();
  await expect(inheritedDark).not.toHaveAttribute("data-theme");
  await expect(explicitDark).toHaveAttribute("data-theme", "dark");
  await expect(explicitLight).toHaveAttribute("data-theme", "light");
  const appearance = (selector: string) => page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderColor, scheme: style.colorScheme };
  });
  const dark = await appearance("#inherited-dark");
  const light = await appearance("#inherited-root");
  expect(dark.scheme).toBe("dark");
  expect(light.scheme).toBe("light");
  expect(dark.background).not.toBe(light.background);
  expect(dark.color).not.toBe(light.color);
  expect(await appearance("#explicit-dark")).toEqual(dark);
  expect(await appearance("#explicit-light")).toEqual(light);
  expect(await appearance("#icon-light svg")).toMatchObject({ color: light.color, scheme: "light" });

  await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("dark");
  await expect.poll(() => appearance("#inherited-root")).toEqual(dark);
  expect(await appearance("#inherited-dark")).toEqual(dark);
  expect(await appearance("#explicit-light")).toEqual(light);
  expect(await appearance("#icon-light svg")).toMatchObject({ color: light.color, scheme: "light" });
  await expect(inheritedRoot).not.toHaveAttribute("data-theme");
});

test("board coordinates remain opaque and readable in both themes", async ({ page }) => {
  await mockPractice(page);
  await page.goto("/#/decks/woodpecker/positions/1");
  await expect(page.getByLabel("Chess position")).toBeVisible();
  const luminance = (rgb: string) => {
    const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption(theme);
    const appearance = await page.getByLabel("Chess position").evaluate(board => {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = "var(--board-dark)";
      board.append(swatch);
      const background = getComputedStyle(swatch).backgroundColor;
      swatch.remove();
      return {
        background,
        coordinates: [...board.querySelectorAll("coords coord")].map(coordinate => ({
          color: getComputedStyle(coordinate).color,
          opacity: getComputedStyle(coordinate).opacity,
          parentOpacity: getComputedStyle(coordinate.parentElement!).opacity,
        })),
      };
    });
    expect(appearance.coordinates.length).toBe(16);
    for (const coordinate of appearance.coordinates) {
      expect(coordinate.opacity).toBe("1");
      expect(coordinate.parentOpacity).toBe("1");
      const values = [luminance(coordinate.color), luminance(appearance.background)].sort((a, b) => a - b);
      const contrast = (values[1] + 0.05) / (values[0] + 0.05);
      expect(contrast, `${theme}: ${coordinate.color} on ${appearance.background}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
