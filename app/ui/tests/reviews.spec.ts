import { expect, test, type Page } from "@playwright/test";

import type { ReviewOption, ReviewQueue, ReviewRating } from "../src/reviewClient";

const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";
const serverNow = "2026-09-16T12:00:00.000Z";
const schedules: Record<ReviewRating, ReviewOption> = {
  easy: { dueAt: "2026-09-20T12:00:00.000Z", intervalDays: 4, scheduleUnchanged: false },
  hard: { dueAt: "2026-09-17T12:00:00.000Z", intervalDays: 1, scheduleUnchanged: false },
  again: { dueAt: "2026-09-16T12:10:00.000Z", intervalDays: 10 / 1440, scheduleUnchanged: false },
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
  { rating: "easy", label: "Easy" },
  { rating: "hard", label: "Hard" },
  { rating: "again", label: "Didn’t solve" },
] as const;

function savedReview(payload: ReviewPayload) {
  return {
    ...schedules[payload.rating],
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
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: queue }));
}

async function submitPosition(page: Page) {
  await page.goto("/#/decks/woodpecker/positions/1");
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
}

const scheduledQueue: ReviewQueue = {
  serverNow,
  cards: [firstFen, secondFen].map(fen => ({ fen, status: "scheduled", dueAt: schedules.easy.dueAt })),
  recommendedFen: null,
  nextDueAt: schedules.easy.dueAt,
};

for (const { rating, label } of ratings) {
  test(`saves ${rating} and automatically opens the server's recommended puzzle`, async ({ page }) => {
    await mockPractice(page);
    let payload: ReviewPayload | undefined;
    await page.route("**/v1/reviews", async route => {
      payload = route.request().postDataJSON() as ReviewPayload;
      await route.fulfill({ json: savedReview(payload) });
    });
    await submitPosition(page);
    const ratingButton = page.getByRole("button", { name: label, exact: true });
    await ratingButton.scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await ratingButton.click();
    await expect(page).toHaveURL(/\/positions\/2$/);
    await expect(page.getByRole("heading", { name: "Woodpecker - 2", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    expect(payload).toEqual({
      learnerId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      reviewId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      collection: "woodpecker",
      fen: firstFen,
      rating,
    });
    await expect(page.getByText(/^Review saved/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next recommended", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`submission preserves board, controls, and scroll geometry at ${viewport.width}px`, async ({ page }, testInfo) => {
    await mockPractice(page);
    await page.setViewportSize(viewport);
    await page.goto("/#/decks/woodpecker/positions/1");
    const submit = page.getByRole("button", { name: "Submit", exact: true });
    await expect(submit).toBeVisible();
    for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await submit.focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent)).not.toMatch(/^(Easy|Hard|Didn’t solve)$/);
    await submit.scrollIntoViewIfNeeded();
    const before = {
      board: await page.getByLabel("Chess position").boundingBox(),
      submit: await submit.boundingBox(),
      scrollY: await page.evaluate(() => window.scrollY),
    };
    if (!before.board || !before.submit) throw new Error("Expected visible board and Submit button");
    await submit.click();
    await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Easy", exact: true })).toBeEnabled();
    expect(await submit.boundingBox()).toEqual(before.submit);
    expect(await page.getByLabel("Chess position").boundingBox()).toEqual(before.board);
    expect(await page.evaluate(() => window.scrollY)).toBe(before.scrollY);
    let previous = before.submit;
    for (const { label } of ratings) {
      const button = page.getByRole("button", { name: label, exact: true });
      await expect(button).toHaveText(label);
      const box = await button.boundingBox();
      if (!box) throw new Error(`Expected visible ${label} button`);
      expect(box.y).toBe(before.submit.y);
      expect(box.width).toBe(before.submit.width);
      expect(box.height).toBe(before.submit.height);
      expect(box.x - previous.x - previous.width).toBeGreaterThan(0);
      expect(box.x - previous.x - previous.width).toBeLessThanOrEqual(label === "Easy" ? 32 : 16);
      previous = box;
    }
    await expect(page.getByRole("heading", { name: "How did it feel?" })).toHaveCount(0);
    await expect(page.getByText("Choose when to practice this puzzle again.", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^(4 days|1 day|10 min)$/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next recommended", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`review-${viewport.width}.png`), fullPage: true });
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
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toBeDisabled();
  releaseSave();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/positions\/1$/);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/2$/);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
});

test("when saving succeeds but fetching the next puzzle fails, Retry only fetches the queue", async ({ page }) => {
  await mockPractice(page);
  let saves = 0;
  let queueRequests = 0;
  await page.route("**/v1/reviews", async route => {
    saves += 1;
    await route.fulfill({ json: savedReview(route.request().postDataJSON() as ReviewPayload) });
  });
  await page.route("**/v1/review-queue?*", route => {
    queueRequests += 1;
    return queueRequests === 1
      ? route.fulfill({ status: 503, json: { error: "Temporary failure" } })
      : route.fulfill({ json: queue });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/positions\/1$/);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/2$/);
  expect(saves).toBe(1);
  expect(queueRequests).toBe(2);
});

test("a late save cannot navigate away from a different puzzle", async ({ page }) => {
  await mockPractice(page);
  const payloads: ReviewPayload[] = [];
  let queueRequests = 0;
  await page.route("**/v1/review-queue?*", route => {
    queueRequests += 1;
    return route.fulfill({ json: { ...queue, recommendedFen: firstFen } });
  });
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    if (payload.fen === firstFen) await pendingSave;
    await route.fulfill({ json: savedReview(payload) });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  await page.getByRole("button", { name: "Next position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Woodpecker - 2", exact: true })).toBeVisible();
  const completedSave = page.waitForResponse(response => response.url().endsWith("/v1/reviews"));
  releaseSave();
  await completedSave;
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hard", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/positions\/2$/);
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(page).toHaveURL(/\/positions\/1$/);
  expect(payloads).toHaveLength(2);
  expect(payloads[1].fen).toBe(secondFen);
  expect(payloads[1].reviewId).not.toBe(payloads[0].reviewId);
  expect(payloads[1].learnerId).toBe(payloads[0].learnerId);
  expect(queueRequests).toBe(1);
});

test("all scheduled stays on the result and editing cannot rate the attempt twice", async ({ page }) => {
  await mockPractice(page);
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: scheduledQueue }));
  const payloads: ReviewPayload[] = [];
  await page.route("**/v1/reviews", async route => {
    const payload = route.request().postDataJSON() as ReviewPayload;
    payloads.push(payload);
    await route.fulfill({ json: savedReview(payload) });
  });
  await submitPosition(page);
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByText("All caught up.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/positions\/1$/);
  await expect(page.getByText(/^Review saved/)).toHaveCount(0);
  await page.getByLabel("Move notation").getByRole("button", { name: "Nd3", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("0% coverage", { exact: true })).toBeVisible();
  await expect(page.getByText("All caught up.", { exact: true })).toBeVisible();
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toBeDisabled();
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
  await page.getByRole("button", { name: "Didn’t solve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/positions\/1$/);
  for (const { label } of ratings) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
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
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: scheduledQueue }));
  await page.goto("/#/decks/woodpecker");
  await expect(page.getByText(/All caught up/i)).toBeVisible();
  await expect(page.getByText(/Next review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice recommended", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeEnabled();
});
