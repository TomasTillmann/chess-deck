import { expect, test, type Page } from "@playwright/test";

import type { ReviewOptions, ReviewQueue, ReviewRating } from "../src/reviewClient";

const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";
const serverNow = "2026-09-16T12:00:00.000Z";
const reviewOptions: ReviewOptions = {
  serverNow,
  dueAt: null,
  options: {
    easy: { dueAt: "2026-09-20T12:00:00.000Z", intervalDays: 4, scheduleUnchanged: false },
    hard: { dueAt: "2026-09-17T12:00:00.000Z", intervalDays: 1, scheduleUnchanged: false },
    again: { dueAt: "2026-09-16T12:10:00.000Z", intervalDays: 10 / 1440, scheduleUnchanged: false },
  },
};
const queue: ReviewQueue = {
  serverNow,
  cards: [
    { fen: secondFen, status: "due", dueAt: "2026-09-15T12:00:00.000Z" },
    { fen: firstFen, status: "new", dueAt: null },
  ],
  recommendedFen: secondFen,
  nextDueAt: null,
};
type ReviewPayload = {
  learnerId: string;
  reviewId: string;
  collection: string;
  fen: string;
  rating: ReviewRating;
};
const ratings = [
  { rating: "easy", label: /^Easy\b/, interval: "4 days" },
  { rating: "hard", label: /^Hard\b/, interval: "1 day" },
  { rating: "again", label: /^Didn[’']t solve\b/, interval: "10 min" },
] as const;

function savedReview(payload: ReviewPayload) {
  return {
    ...reviewOptions.options[payload.rating],
    reviewId: payload.reviewId,
    rating: payload.rating,
    repetitions: payload.rating === "again" ? 0 : 1,
    lapses: payload.rating === "again" ? 1 : 0,
  };
}

async function mockPractice(page: Page) {
  await page.route("**/v1/collections", route => route.fulfill({ json: {
    collections: [{ slug: "woodpecker", name: "Woodpecker", description: "Practice deck", fens: [firstFen, secondFen] }],
  } }));
  await page.route("**/v1/solution/**", route => {
    const fen = decodeURIComponent(new URL(route.request().url()).pathname.slice("/v1/solution/".length));
    const turn = fen === firstFen ? "b" : "w";
    return route.fulfill({ json: {
      fen,
      sideToSolve: turn,
      status: "solved",
      root: { fen, turn, moves: [{ uci: fen === firstFen ? "f4d3" : "d1e1", children: [{ moves: [] }] }] },
    } });
  });
  await page.route("**/v1/review-options?*", route => route.fulfill({ json: reviewOptions }));
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: queue }));
}

async function submitPosition(page: Page) {
  await page.goto("/#/decks/woodpecker/positions/1");
  await expect(page.getByRole("heading", { name: "How did it feel?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How did it feel?" })).toBeVisible();
}

for (const { rating, label, interval } of ratings) {
  test(`saves ${rating} with the backend interval and follows its next recommendation`, async ({ page }, testInfo) => {
    await mockPractice(page);
    let payload: ReviewPayload | undefined;
    await page.route("**/v1/reviews", async route => {
      payload = route.request().postDataJSON() as ReviewPayload;
      await route.fulfill({ json: savedReview(payload) });
    });
    await submitPosition(page);
    await expect(page.getByRole("button", { name: label })).toContainText(interval);
    if (rating === "easy") {
      await page.screenshot({ path: testInfo.outputPath("review-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("button", { name: label })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.screenshot({ path: testInfo.outputPath("review-mobile.png"), fullPage: true });
    }
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByText(/^Review saved/)).toBeVisible();
    for (const item of ratings) await expect(page.getByRole("button", { name: item.label })).toBeDisabled();
    expect(payload).toEqual({
      learnerId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      reviewId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      collection: "woodpecker",
      fen: firstFen,
      rating,
    });
    await page.getByRole("button", { name: "Next recommended", exact: true }).click();
    await expect(page).toHaveURL(/\/positions\/2$/);
    await expect(page.getByRole("heading", { name: "Woodpecker - 2", exact: true })).toBeVisible();
    await expect(page.getByText(/^Review saved/)).toHaveCount(0);
  });
}

test("a pending save locks ratings and a failed save retries the exact attempt", async ({ page }) => {
  await mockPractice(page);
  const payloads: ReviewPayload[] = [];
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    if (payloads.length === 1) {
      await pendingSave;
      await route.fulfill({ status: 503, json: { error: "Temporary failure" } });
    } else {
      await route.fulfill({ json: savedReview(payload) });
    }
  });
  await submitPosition(page);
  await page.getByRole("button", { name: /^Hard\b/ }).click();
  await expect.poll(() => payloads.length).toBe(1);
  for (const item of ratings) await expect(page.getByRole("button", { name: item.label })).toBeDisabled();
  releaseSave();
  await expect(page.getByRole("button", { name: "Retry saving review", exact: true })).toBeVisible();
  await expect(page.getByText(/^Review saved/)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry saving review", exact: true }).click();
  await expect(page.getByText(/^Review saved/)).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
});

test("ratings wait for server intervals and failed interval loading can be retried", async ({ page }) => {
  await mockPractice(page);
  let requests = 0;
  let releaseOptions!: () => void;
  const pendingOptions = new Promise<void>(resolve => { releaseOptions = resolve; });
  await page.route("**/v1/review-options?*", async route => {
    requests += 1;
    if (requests === 1) {
      await pendingOptions;
      await route.fulfill({ status: 503, json: { error: "Temporary failure" } });
    } else {
      await route.fulfill({ json: reviewOptions });
    }
  });
  await submitPosition(page);
  await expect(page.getByText("Loading review times…", { exact: true })).toBeVisible();
  for (const item of ratings) await expect(page.getByRole("button", { name: item.label })).toBeDisabled();
  releaseOptions();
  await page.getByRole("button", { name: "Retry loading review times", exact: true }).click();
  for (const item of ratings) {
    await expect(page.getByRole("button", { name: item.label })).toBeEnabled();
    await expect(page.getByRole("button", { name: item.label })).toContainText(item.interval);
  }
  expect(requests).toBe(2);
});

test("a late save cannot put the previous puzzle's result onto the next puzzle", async ({ page }) => {
  await mockPractice(page);
  const payloads: ReviewPayload[] = [];
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    if (payload.fen === firstFen) await pendingSave;
    await route.fulfill({ json: savedReview(payload) });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: /^Easy\b/ }).click();
  await expect.poll(() => payloads.length).toBe(1);
  await page.getByRole("button", { name: "Next position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Woodpecker - 2", exact: true })).toBeVisible();
  const completedSave = page.waitForResponse(response => response.url().endsWith("/v1/reviews"));
  releaseSave();
  await completedSave;
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Hard\b/ })).toBeEnabled();
  await expect(page.getByText(/^Review saved/)).toHaveCount(0);
  await page.getByRole("button", { name: /^Hard\b/ }).click();
  await expect(page.getByText(/^Review saved/)).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1].fen).toBe(secondFen);
  expect(payloads[1].reviewId).not.toBe(payloads[0].reviewId);
  expect(payloads[1].learnerId).toBe(payloads[0].learnerId);
});

test("editing and resubmitting the move tree cannot rate one attempt twice", async ({ page }) => {
  await mockPractice(page);
  const payloads: ReviewPayload[] = [];
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    await route.fulfill({ json: savedReview(payload) });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: /^Easy\b/ }).click();
  await expect(page.getByText(/^Review saved/)).toBeVisible();
  await page.getByLabel("Move notation").getByRole("button", { name: "Nd3", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Review saved/)).toBeVisible();
  for (const item of ratings) await expect(page.getByRole("button", { name: item.label })).toBeDisabled();
  expect(payloads).toHaveLength(1);
});

test("recommending the current puzzle starts a fresh attempt with a new review ID", async ({ page }) => {
  await mockPractice(page);
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: { ...queue, recommendedFen: firstFen } }));
  const payloads: ReviewPayload[] = [];
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    await route.fulfill({ json: savedReview(payload) });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: /^Didn[’']t solve\b/ }).click();
  await page.getByRole("button", { name: "Next recommended", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/1$/);
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  await expect(page.getByText(/^Review saved/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "How did it feel?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: /^Hard\b/ }).click();
  await expect(page.getByText(/^Review saved/)).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1].reviewId).not.toBe(payloads[0].reviewId);
});

test("the deck recommends the server's due card before an earlier new position", async ({ page }) => {
  await mockPractice(page);
  await page.goto("/#/decks/woodpecker");
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toContainText(/New/i);
  await expect(page.getByRole("button", { name: "Position 2", exact: true })).toContainText(/Due/i);
  await page.getByRole("button", { name: "Practice recommended", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/2$/);
});

test("a fully scheduled deck shows the next due date without recommending early practice", async ({ page }) => {
  await mockPractice(page);
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: {
    serverNow,
    cards: [firstFen, secondFen].map(fen => ({ fen, status: "scheduled", dueAt: reviewOptions.options.easy.dueAt })),
    recommendedFen: null,
    nextDueAt: reviewOptions.options.easy.dueAt,
  } }));
  await page.goto("/#/decks/woodpecker");
  await expect(page.getByText(/All caught up/i)).toBeVisible();
  await expect(page.getByText(/Next review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice recommended", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeEnabled();
});
