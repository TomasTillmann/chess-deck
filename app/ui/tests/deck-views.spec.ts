import { expect, test, type Page } from "@playwright/test";

const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";
const viewId = "27b564f9-e0d3-4778-bc41-1a36bcdd1ba2";
const serverNow = "2026-09-16T12:00:00.000Z";
type Collection = { slug: string; name: string; fens: string[] };
type DeckView = { id: string; name: string; collections: string[]; createdAt: string; updatedAt: string };
type Review = { learnerId: string; collection: string; fen: string; reviewId: string; rating: string };

function savedView(collections = ["alpha", "beta"]): DeckView {
  return { id: viewId, name: "Alpha + Beta", collections, createdAt: serverNow, updatedAt: serverNow };
}

async function mockViews(page: Page, views: DeckView[] = []) {
  const state = {
    collections: [
      { slug: "alpha", name: "Alpha", fens: [firstFen] },
      { slug: "beta", name: "Beta", fens: [secondFen] },
      { slug: "gamma", name: "Gamma", fens: [firstFen] },
    ] as Collection[],
    views,
    creates: [] as { learnerId: string; collections: string[] }[],
    renames: [] as { learnerId: string; name: string }[],
    deletions: [] as URL[],
    queueRequests: [] as URL[],
    reviews: [] as Review[],
    failCreate: false,
    failRename: false,
    failDelete: false,
    beforeRename: undefined as (() => Promise<void>) | undefined,
    recommendedCollection: "beta",
  };
  await page.route("**/v1/collections", route => route.fulfill({ json: { collections: state.collections } }));
  await page.route("**/v1/deck-views**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split("/")[3];
    const view = state.views.find(item => item.id === id);
    if (request.method() === "POST") {
      const payload = request.postDataJSON() as typeof state.creates[number];
      state.creates.push(payload);
      if (state.failCreate) return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
      const created = state.views.find(item => [...item.collections].sort().join() === [...payload.collections].sort().join()) ?? {
        ...savedView(payload.collections),
        name: payload.collections.map(slug => state.collections.find(deck => deck.slug === slug)!.name).join(" + "),
      };
      if (!state.views.includes(created)) state.views.push(created);
      return route.fulfill({ json: created });
    }
    if (!id) return route.fulfill({ json: { views: state.views } });
    if (!view) return route.fulfill({ status: 404, json: { error: "View not found" } });
    if (request.method() === "PATCH") {
      const payload = request.postDataJSON() as typeof state.renames[number];
      state.renames.push(payload);
      await state.beforeRename?.();
      if (state.failRename) return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
      view.name = payload.name;
      return route.fulfill({ json: view });
    }
    if (request.method() === "DELETE") {
      state.deletions.push(url);
      if (state.failDelete) return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
      state.views = state.views.filter(item => item.id !== id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: view });
  });
  await page.route("**/v1/practice-queue?*", route => {
    const url = new URL(route.request().url());
    state.queueRequests.push(url);
    const scope = url.searchParams.getAll("collection");
    const cards = state.collections.filter(deck => scope.length === 0 || scope.includes(deck.slug))
      .flatMap(deck => deck.fens.map(fen => ({ collection: deck.slug, fen, status: "new", dueAt: null })));
    const recommended = cards.find(card => card.collection === state.recommendedCollection) ?? cards[0];
    return route.fulfill({ json: {
      serverNow, cards, nextDueAt: null, recommendedFen: recommended?.fen ?? null,
      recommendedCard: recommended ? { collection: recommended.collection, fen: recommended.fen } : null,
    } });
  });
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: {
    serverNow, cards: [], recommendedFen: null, nextDueAt: null,
  } }));
  await page.route("**/v1/solution/**", route => {
    const fen = decodeURIComponent(new URL(route.request().url()).pathname.slice("/v1/solution/".length));
    const turn = fen === firstFen ? "b" : "w";
    return route.fulfill({ json: {
      fen, sideToSolve: turn, status: "solved",
      root: { fen, turn, moves: [{ uci: fen === firstFen ? "f4d3" : "d1e1", children: [{ moves: [] }] }] },
    } });
  });
  await page.route("**/v1/reviews", route => {
    const payload = route.request().postDataJSON() as Review;
    state.reviews.push(payload);
    return route.fulfill({ json: {
      reviewId: payload.reviewId, rating: payload.rating, dueAt: "2026-09-20T12:00:00.000Z",
      intervalDays: 4, scheduleUnchanged: false, repetitions: 1, lapses: 0,
    } });
  });
  return state;
}

test("selecting decks saves a named view, practices its scope, and preserves source reviews after reopening", async ({ page }) => {
  const state = await mockViews(page);
  await page.goto("/");
  const practice = page.getByRole("button", { name: "Practice", exact: true });
  await expect(practice).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select Alpha", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select Beta", exact: true }).check();
  await expect(page).not.toHaveURL(/#\/decks\//);
  await expect(page.getByRole("checkbox", { name: "Select Gamma", exact: true })).not.toBeChecked();
  await practice.click();
  await expect(page).toHaveURL(new RegExp(`#/views/${viewId}/practice$`));
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(1);
  expect(state.creates[0].collections).toEqual(["alpha", "beta"]);
  expect(state.creates[0].learnerId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(state.views[0].name).toBe("Alpha + Beta");
  state.recommendedCollection = "alpha";
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  expect(state.reviews).toHaveLength(1);
  expect(state.reviews[0]).toMatchObject({ collection: "beta", fen: secondFen, rating: "easy", learnerId: state.creates[0].learnerId });
  await page.getByRole("button", { name: "Go to decks", exact: true }).click();
  const views = page.getByRole("region", { name: "Deck Views", exact: true });
  await expect(views.getByRole("button", { name: "Practice Alpha + Beta", exact: true })).toBeVisible();
  await page.reload();
  await views.getByRole("button", { name: "Practice Alpha + Beta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(1);
  expect(state.queueRequests.length).toBeGreaterThanOrEqual(3);
  for (const url of state.queueRequests) {
    expect(url.searchParams.getAll("collection")).toEqual(["alpha", "beta"]);
    expect(url.searchParams.get("learnerId")).toBe(state.creates[0].learnerId);
  }
});

test("deck cards retain ordinary navigation and clearing selection disables Practice", async ({ page }) => {
  const state = await mockViews(page);
  await page.goto("/");
  const alpha = page.getByRole("checkbox", { name: "Select Alpha", exact: true });
  await alpha.check();
  await expect(page.getByRole("button", { name: "Practice", exact: true })).toBeEnabled();
  await alpha.uncheck();
  await expect(page.getByRole("button", { name: "Practice", exact: true })).toBeDisabled();
  await page.getByRole("region", { name: "Decks", exact: true }).getByRole("button", { name: /Alpha/ }).click();
  await expect(page).toHaveURL(/#\/decks\/alpha$/);
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(0);
  expect(state.reviews).toHaveLength(0);
});

test("a failed create keeps selection for retry", async ({ page }) => {
  const state = await mockViews(page);
  state.failCreate = true;
  await page.goto("/");
  for (const name of ["Alpha", "Beta"]) await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/could not|failed/i);
  for (const name of ["Alpha", "Beta"]) await expect(page.getByRole("checkbox", { name: `Select ${name}`, exact: true })).toBeChecked();
  expect(state.views).toHaveLength(0);
  state.failCreate = false;
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(2);
  expect(state.creates[1]).toEqual(state.creates[0]);
});

test("rename supports cancel, validation, pending failure and retry without changing the scope", async ({ page }) => {
  const state = await mockViews(page, [savedView()]);
  await page.goto("/");
  const rename = page.getByRole("button", { name: "Rename Alpha + Beta", exact: true });
  await rename.click();
  const input = page.getByRole("textbox", { name: "View name", exact: true });
  await input.fill("Discard this");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(rename).toBeFocused();
  expect(state.renames).toHaveLength(0);
  await rename.click();
  await input.fill("   ");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await input.fill("  My tactics  ");
  let release!: () => void;
  state.beforeRename = () => new Promise<void>(resolve => { release = resolve; });
  state.failRename = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => state.renames.length).toBe(1);
  await expect(input).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(/could not rename/i);
  await expect(input).toHaveValue("  My tactics  ");
  state.beforeRename = undefined;
  state.failRename = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Practice My tactics", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My tactics", exact: true })).toBeVisible();
  expect(state.renames.map(payload => payload.name)).toEqual(["My tactics", "My tactics"]);
  expect(state.views[0].collections).toEqual(["alpha", "beta"]);
  expect(state.reviews).toHaveLength(0);
});

test("delete requires confirmation, recovers from failure, and only deletes view metadata", async ({ page }) => {
  const state = await mockViews(page, [savedView()]);
  await page.goto("/");
  const remove = page.getByRole("button", { name: "Delete Alpha + Beta", exact: true });
  const dialog = page.getByRole("dialog", { name: "Delete deck view", exact: true });
  await remove.click();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.deletions).toHaveLength(0);
  state.failDelete = true;
  await remove.click();
  await dialog.getByRole("button", { name: "Delete view", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(/could not delete/i);
  expect(state.views).toHaveLength(1);
  state.failDelete = false;
  await dialog.getByRole("button", { name: "Delete view", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(remove).toHaveCount(0);
  await page.reload();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Select Alpha", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select Beta", exact: true })).toBeVisible();
  expect(state.deletions).toHaveLength(2);
  for (const url of state.deletions) expect(url.searchParams.get("learnerId")).toMatch(/^[0-9a-f-]{36}$/i);
  expect(state.views).toHaveLength(0);
  expect(state.reviews).toHaveLength(0);
});

for (const unavailable of ["removed", "empty", "empty-scope"] as const) {
  test(`reopening a view with ${unavailable} sources never broadens practice to all decks`, async ({ page }) => {
    const state = await mockViews(page, [savedView(unavailable === "empty-scope" ? [] : ["alpha"])]);
    if (unavailable === "removed") state.collections = state.collections.filter(deck => deck.slug !== "alpha");
    if (unavailable === "empty") state.collections[0].fens = [];
    await page.goto(`/#/views/${viewId}/practice`);
    await expect(page.getByText("No positions available.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
    if (unavailable === "empty-scope") expect(state.queueRequests).toHaveLength(0);
    else {
      expect(state.queueRequests.length).toBeGreaterThan(0);
      for (const url of state.queueRequests) expect(url.searchParams.getAll("collection")).toEqual(["alpha"]);
    }
    expect(state.reviews).toHaveLength(0);
  });
}

test("a removed source leaves surviving view decks practiceable without adding unrelated decks", async ({ page }) => {
  const state = await mockViews(page, [savedView()]);
  state.collections = state.collections.filter(deck => deck.slug !== "alpha");
  await page.goto(`/#/views/${viewId}/practice`);
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous position", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next position", exact: true })).toBeDisabled();
  expect(state.queueRequests.length).toBeGreaterThan(0);
  for (const url of state.queueRequests) expect(url.searchParams.getAll("collection")).toEqual(["alpha", "beta"]);
  expect(state.reviews).toHaveLength(0);
});
