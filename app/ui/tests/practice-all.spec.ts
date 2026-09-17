import { expect, test, type Page, type Route } from "@playwright/test";

const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";
const serverNow = "2026-09-16T12:00:00.000Z";
const dueAt = "2026-09-20T12:00:00.000Z";

type Collection = { slug: string; name: string; fens: string[] };
type Card = { collection: string; fen: string; status: "new" | "due" | "scheduled"; dueAt: string | null };
type ReviewPayload = { learnerId: string; reviewId: string; collection: string; fen: string; rating: string };

function queueFor(collections: Collection[], recommendedCard: { collection: string; fen: string } | null) {
  return {
    serverNow,
    cards: collections.flatMap(deck => deck.fens.map((fen): Card => ({ collection: deck.slug, fen, status: "new", dueAt: null }))),
    recommendedCard,
    recommendedFen: recommendedCard?.fen ?? null,
    nextDueAt: null as string | null,
  };
}

async function mockPractice(page: Page) {
  const collections: Collection[] = [
    { slug: "alpha", name: "Alpha", fens: [firstFen] },
    { slug: "beta", name: "Beta", fens: [secondFen] },
  ];
  const state = {
    collections,
    queue: queueFor(collections, { collection: "beta", fen: secondFen }),
    failQueue: false,
    collectionRequests: 0,
    queueRequests: [] as URL[],
    reviews: [] as ReviewPayload[],
  };
  await page.route("**/v1/collections", route => {
    state.collectionRequests += 1;
    return route.fulfill({ json: { collections: state.collections } });
  });
  await page.route("**/v1/practice-queue?*", route => {
    state.queueRequests.push(new URL(route.request().url()));
    return state.failQueue
      ? route.fulfill({ status: 503, json: { error: "Temporary failure" } })
      : route.fulfill({ json: state.queue });
  });
  await page.route("**/v1/solution/**", route => {
    const fen = decodeURIComponent(new URL(route.request().url()).pathname.slice("/v1/solution/".length));
    const turn = fen === firstFen ? "b" : "w";
    return route.fulfill({ json: {
      fen, sideToSolve: turn, status: "solved",
      root: { fen, turn, moves: [{ uci: fen === firstFen ? "f4d3" : "d1e1", children: [{ moves: [] }] }] },
    } });
  });
  await page.route("**/v1/reviews", route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    state.reviews.push(payload);
    return route.fulfill({ json: {
      reviewId: payload.reviewId, rating: payload.rating, dueAt, intervalDays: 4,
      scheduleUnchanged: false, repetitions: 1, lapses: 0,
    } });
  });
  return state;
}

async function rate(page: Page, label = "Easy") {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save solution", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("Practice All sits above Decks and follows the global recommendation across source decks", async ({ page }) => {
  const state = await mockPractice(page);
  await page.goto("/");
  const practice = page.getByRole("button", { name: "Practice All", exact: true });
  const heading = page.getByRole("heading", { name: "Decks", exact: true });
  await expect(practice).toBeVisible();
  await expect(page.getByRole("region", { name: "Decks", exact: true }).getByRole("button", { name: "Practice All", exact: true })).toHaveCount(0);
  const buttonBox = await practice.boundingBox();
  const headingBox = await heading.boundingBox();
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(headingBox!.y);
  const initialCollectionRequests = state.collectionRequests;
  await practice.click();
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  expect(state.collectionRequests).toBeGreaterThan(initialCollectionRequests);
  expect(state.queueRequests.length).toBeGreaterThan(0);
  for (const url of state.queueRequests) {
    expect(url.searchParams.get("learnerId")).toMatch(/^[0-9a-f-]{36}$/i);
    expect([...url.searchParams.keys()]).toEqual(["learnerId"]);
  }
  await page.getByRole("button", { name: "Previous position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Go to decks", exact: true }).click();
  await expect(heading).toBeVisible();
  await expect(practice).toBeVisible();
  expect(state.reviews).toHaveLength(0);
});

test("ratings use the source collection and reset the attempt when two decks share a FEN", async ({ page }) => {
  const state = await mockPractice(page);
  state.collections[1].fens = [firstFen];
  state.queue = queueFor(state.collections, { collection: "beta", fen: firstFen });
  await page.goto("/#/practice");
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  state.queue = queueFor(state.collections, { collection: "alpha", fen: firstFen });
  await rate(page);
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  state.queue = queueFor(state.collections, { collection: "beta", fen: firstFen });
  await rate(page, "Hard");
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/practice$/);
  expect(state.reviews).toHaveLength(2);
  expect(state.reviews[0]).toMatchObject({ collection: "beta", fen: firstFen, rating: "easy" });
  expect(state.reviews[1]).toMatchObject({ collection: "alpha", fen: firstFen, rating: "hard", learnerId: state.reviews[0].learnerId });
  expect(state.reviews[1].reviewId).not.toBe(state.reviews[0].reviewId);
});

test("the combined view refreshes added, updated, and removed decks after a rating", async ({ page }) => {
  const state = await mockPractice(page);
  await page.goto("/#/practice");
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  const collectionRequests = state.collectionRequests;
  state.collections = [
    { slug: "beta", name: "Beta", fens: [firstFen, secondFen] },
    { slug: "gamma", name: "Gamma", fens: [firstFen] },
  ];
  state.queue = queueFor(state.collections, { collection: "gamma", fen: firstFen });
  await rate(page);
  await expect(page.getByRole("heading", { name: "Gamma - 1", exact: true })).toBeVisible();
  expect(state.collectionRequests).toBeGreaterThan(collectionRequests);
  expect(state.reviews[0]).toMatchObject({ collection: "beta", fen: secondFen });
  await expect(page.getByRole("button", { name: "Next position", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta - 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous position", exact: true })).toBeDisabled();
});

for (const empty of [true, false]) {
  test(empty ? "an empty collection scope has no puzzle to practice" : "a fully scheduled scope does not start early practice", async ({ page }) => {
    const state = await mockPractice(page);
    if (empty) state.collections = [];
    state.queue = queueFor(state.collections, null);
    if (!empty) {
      state.queue.cards = state.queue.cards.map(card => ({ ...card, status: "scheduled", dueAt }));
      state.queue.nextDueAt = dueAt;
    }
    await page.goto("/#/practice");
    await expect(page.getByText(empty ? /No positions/i : /All caught up/i)).toBeVisible();
    if (!empty) await expect(page.getByText(/Next review/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Go to decks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Decks", exact: true })).toBeVisible();
    expect(state.reviews).toHaveLength(0);
  });
}

test("an initial queue failure can be retried", async ({ page }) => {
  const state = await mockPractice(page);
  state.failQueue = true;
  await page.goto("/#/practice");
  await expect(page.getByText("Could not load practice.", { exact: true })).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  state.failQueue = false;
  await retry.click();
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  expect(state.reviews).toHaveLength(0);
});

test("retrying the next recommendation after a saved rating does not post the review twice", async ({ page }) => {
  const state = await mockPractice(page);
  await page.goto("/#/practice");
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  state.failQueue = true;
  await rate(page);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toBeDisabled();
  expect(state.reviews).toHaveLength(1);
  state.failQueue = false;
  state.queue = queueFor(state.collections, { collection: "alpha", fen: firstFen });
  await retry.click();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  expect(state.reviews).toHaveLength(1);
});

test("a late recommendation cannot replace a puzzle selected with the navigation arrows", async ({ page }) => {
  const state = await mockPractice(page);
  await page.goto("/#/practice");
  await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
  let releaseQueue!: () => void;
  const pendingQueue = new Promise<void>(resolve => { releaseQueue = resolve; });
  let nextRequested = false;
  await page.route("**/v1/practice-queue?*", async route => {
    nextRequested = true;
    await pendingQueue;
    await route.fulfill({ json: state.queue });
  });
  await rate(page);
  await expect.poll(() => nextRequested).toBe(true);
  await page.getByRole("button", { name: "Previous position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  const response = page.waitForResponse(response => response.url().includes("/v1/practice-queue?"));
  releaseQueue();
  await (await response).finished();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alpha - 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toBeEnabled();
  expect(state.reviews).toHaveLength(1);
});

for (const initialResult of ["failed", "delayed"] as const) {
  test(`practice refresh replaces the ${initialResult} initial catalog when returning home`, async ({ page }) => {
    await mockPractice(page);
    let initialLoad = true;
    const delayedRoutes: Route[] = [];
    await page.route("**/v1/collections", route => {
      if (!initialLoad) return route.fallback();
      if (initialResult === "failed") return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
      delayedRoutes.push(route);
    });
    await page.goto("/");
    await expect(page.getByText(initialResult === "failed" ? /Failed to load collections/ : "Loading positions", { exact: initialResult === "delayed" })).toBeVisible();
    initialLoad = false;
    await page.goto("/#/practice");
    await expect(page.getByRole("heading", { name: "Beta - 1", exact: true })).toBeVisible();
    if (initialResult === "delayed") {
      expect(delayedRoutes.length).toBeGreaterThan(0);
      await Promise.all(delayedRoutes.map(async route => {
        const response = route.request().response();
        await route.fulfill({ json: { collections: [{ slug: "outdated", name: "Outdated", fens: [firstFen] }] } });
        await (await response)?.finished();
      }));
    }
    await page.getByRole("button", { name: "Go to decks", exact: true }).click();
    const decks = page.getByRole("region", { name: "Decks", exact: true });
    await expect(decks.getByRole("button", { name: /Alpha/ })).toBeVisible();
    await expect(decks.getByRole("button", { name: /Beta/ })).toBeVisible();
    await expect(decks.getByRole("button")).toHaveCount(2);
    await expect(page.getByText(/Failed to load collections|Loading positions/)).toHaveCount(0);
  });
}
