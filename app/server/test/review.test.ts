import assert from "node:assert/strict";
import crypto, { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { openDatabase, type Db } from "../src/database.js";
import { createApp } from "../src/http.js";
import { ReviewRepository, ReviewConflictError, type ReviewInput } from "../src/reviewRepository.js";
import { scheduleReview, type ReviewSchedule } from "../src/reviewScheduler.js";

const fen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "4r1k1/p1pb1ppp/Qbp1r3/8/1P6/2Pq1B2/R2P1PPP/2B2RK1 b - - 0 1";
const thirdFen = "8/8/8/8/8/8/5K2/6k1 w - - 0 1";
const learnerId = randomUUID();
const now = Date.parse("2026-09-16T12:00:00.000Z");
const day = 86_400_000;

function seed(db: Db) {
  const insert = db.prepare("INSERT INTO collections (collection, fen) VALUES (?, ?)");
  for (const position of [fen, secondFen, thirdFen, fen]) insert.run("woodpecker", position);
  insert.run("encyclopedia", fen);
}

function review(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return { learnerId, reviewId: randomUUID(), collection: "woodpecker", fen, rating: "easy", ...overrides };
}

test("scheduler learns, grows, relearns, and does not advance early manual practice", () => {
  const easy = scheduleReview(null, "easy", now);
  const hard = scheduleReview(null, "hard", now);
  const again = scheduleReview(null, "again", now);
  assert.equal(easy.intervalDays, 4);
  assert.equal(hard.intervalDays, 1);
  assert.equal(Date.parse(again.dueAt) - now, 10 * 60_000);
  assert.equal(again.repetitions, 0);
  assert.equal(again.lapses, 1);

  const due = Date.parse(easy.dueAt);
  const earlyEasy = scheduleReview(easy, "easy", due - 1);
  const earlyHard = scheduleReview(easy, "hard", due - 1);
  assert.deepEqual(earlyEasy, { ...easy, scheduleUnchanged: true });
  assert.deepEqual(earlyHard, earlyEasy);
  const onTime = scheduleReview(easy, "easy", due);
  assert.equal(onTime.scheduleUnchanged, false);
  assert.equal(onTime.intervalDays, Math.ceil(4 * easy.easeFactor * 1.3));
  assert.equal(onTime.repetitions, 2);
  const difficult = scheduleReview(easy, "hard", due);
  assert.equal(difficult.intervalDays, 5);
  assert.ok(difficult.easeFactor < easy.easeFactor);

  const lapse = scheduleReview(easy, "again", now + 1);
  assert.equal(Date.parse(lapse.dueAt), now + 1 + 600_000);
  assert.equal(lapse.repetitions, 0);
  assert.equal(lapse.lapses, 1);
  const relearned = scheduleReview(lapse, "easy", Date.parse(lapse.dueAt));
  assert.equal(relearned.intervalDays, 4);
  assert.equal(relearned.repetitions, 1);
  assert.equal(relearned.lapses, 1);

  for (const rating of ["easy", "hard", "again"] as const) {
    let previous: ReviewSchedule | null = null;
    let time = now;
    for (let index = 0; index < 150; index += 1) {
      const next = scheduleReview(previous, rating, time);
      assert.ok(next.intervalDays > 0 && next.intervalDays <= 3_650);
      assert.ok(next.easeFactor >= 1.3 && next.easeFactor <= 3);
      assert.ok(Date.parse(next.dueAt) > time);
      previous = next;
      time = Date.parse(next.dueAt);
    }
    if (rating === "easy") assert.equal(previous?.intervalDays, 3_650);
  }
});

test("queue prioritizes due then unseen, deduplicates FENs, and isolates learners/decks", () => {
  const db = openDatabase(":memory:");
  try {
    seed(db);
    const repository = new ReviewRepository(db);
    assert.deepEqual(repository.queue(learnerId, "woodpecker", now).cards.map(card => card.fen), [fen, secondFen, thirdFen]);
    const scheduled = repository.save(review(), now);
    repository.save(review({ fen: secondFen, rating: "again" }), now - 600_000);
    const queue = repository.queue(learnerId, "woodpecker", now);
    assert.deepEqual(queue.cards.map(card => [card.fen, card.status]), [
      [secondFen, "due"], [thirdFen, "new"], [fen, "scheduled"],
    ]);
    assert.equal(queue.recommendedFen, secondFen);
    assert.equal(queue.nextDueAt, scheduled.dueAt);
    assert.equal(queue.serverNow, new Date(now).toISOString());
    assert.ok(repository.queue(randomUUID(), "woodpecker", now).cards.every(card => card.status === "new"));
    assert.equal(repository.queue(learnerId, "encyclopedia", now).cards[0].status, "new");

    const options = repository.options(learnerId, "woodpecker", fen, now + 1);
    assert.equal(options.options.easy.dueAt, scheduled.dueAt);
    assert.equal(options.options.hard.scheduleUnchanged, true);
    assert.equal(options.options.again.scheduleUnchanged, false);
    assert.equal(Date.parse(options.options.again.dueAt), now + 1 + 600_000);

    repository.save(review({ fen: secondFen, rating: "hard" }), now);
    repository.save(review({ fen: thirdFen, rating: "hard" }), now);
    const allScheduled = repository.queue(learnerId, "woodpecker", now);
    assert.equal(allScheduled.recommendedFen, null);
    assert.equal(allScheduled.nextDueAt, new Date(now + day).toISOString());
    const allDue = repository.queue(learnerId, "woodpecker", now + 4 * day);
    assert.deepEqual(allDue.cards.map(card => card.fen), [secondFen, thirdFen, fen]);
    assert.equal(allDue.nextDueAt, null);
  } finally { db.close(); }
});

test("recommendation draws uniformly over every due card, otherwise every unseen card", context => {
  const db = openDatabase(":memory:");
  try {
    seed(db);
    const repository = new ReviewRepository(db);
    const futureFen = fen.replace("0 1", "1 1");
    db.prepare("INSERT INTO collections (collection, fen) VALUES (?, ?)").run("woodpecker", futureFen);
    repository.save(review({ fen: futureFen }), now);
    let selectedIndex = 0;
    let candidateCount = 3;
    const random = context.mock.method(crypto, "randomInt", (maximum: number) => {
      assert.equal(maximum, candidateCount);
      return selectedIndex;
    });

    // Every distinct unseen FEN has exactly one index; duplicate deck rows add no weight.
    for (const expected of [fen, secondFen, thirdFen]) {
      const queue = repository.queue(learnerId, "woodpecker", now);
      assert.equal(queue.recommendedFen, expected);
      assert.deepEqual(queue.cards.map(card => card.fen), [fen, secondFen, thirdFen, futureFen]);
      selectedIndex += 1;
    }

    repository.save(review({ rating: "hard" }), now - 2 * day);
    repository.save(review({ fen: secondFen, rating: "hard" }), now - day);
    candidateCount = 2;
    selectedIndex = 0;
    // All due cards are eligible, regardless of due date; unseen/future cards are excluded.
    for (const expected of [fen, secondFen]) {
      const queue = repository.queue(learnerId, "woodpecker", now);
      assert.equal(queue.recommendedFen, expected);
      assert.deepEqual(queue.cards.map(card => card.status), ["due", "due", "new", "scheduled"]);
      selectedIndex += 1;
    }

    for (const position of [fen, secondFen, thirdFen]) repository.save(review({ fen: position }), now);
    const drawCount = random.mock.callCount();
    assert.equal(repository.queue(learnerId, "woodpecker", now).recommendedFen, null);
    assert.equal(repository.queue(learnerId, "empty", now).recommendedFen, null);
    assert.equal(random.mock.callCount(), drawCount);
  } finally { db.close(); }
});

test("review writes are atomic, durable, idempotent, and return the original result after later reviews", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "chess-review-"));
  const filename = path.join(folder, "test.sqlite");
  let db = openDatabase(filename);
  try {
    seed(db);
    let repository = new ReviewRepository(db);
    const input = review();
    const first = repository.save(input, now);
    assert.deepEqual(repository.save(input, now + day), first);
    assert.throws(() => repository.save({ ...input, rating: "hard" }, now), ReviewConflictError);
    assert.throws(() => repository.save({ ...input, fen: secondFen }, now), ReviewConflictError);
    assert.throws(() => repository.save({ ...input, collection: "encyclopedia" }, now), ReviewConflictError);
    const due = Date.parse(first.dueAt);
    const second = repository.save(review({ rating: "hard" }), due);
    assert.equal(second.repetitions, 2);
    assert.deepEqual(repository.save(input, due + day), first);
    assert.equal(repository.queue(learnerId, "woodpecker", due).cards.find(card => card.fen === fen)?.dueAt, second.dueAt);

    // A storage failure must not leave an updated card without its audit/idempotency row.
    db.exec("CREATE TRIGGER reject_review BEFORE INSERT ON review_events BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => repository.save(review({ rating: "again" }), due));
    assert.equal(repository.options(learnerId, "woodpecker", fen, due).dueAt, second.dueAt);
    db.exec("DROP TRIGGER reject_review");
    db.close();
    db = openDatabase(filename);
    repository = new ReviewRepository(db);
    assert.deepEqual(repository.save(input, due + day), first);
    assert.equal(repository.options(learnerId, "woodpecker", fen, due).dueAt, second.dueAt);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as {count: number}).count, 2);

    const otherLearner = { ...input, learnerId: randomUUID() };
    assert.equal(repository.save(otherLearner, now).repetitions, 1);
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("review API validates requests, previews server intervals, persists and safely retries ratings", async () => {
  const db = openDatabase(":memory:");
  seed(db);
  const server = createApp({ host: "127.0.0.1", port: 0, databasePath: ":memory:" }, db);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) => fetch(`${baseUrl}/v1/reviews`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const query = new URLSearchParams({ learnerId, collection: "woodpecker", fen });
    const previewResponse = await fetch(`${baseUrl}/v1/review-options?${query}`);
    assert.equal(previewResponse.status, 200);
    assert.equal(previewResponse.headers.get("cache-control"), "no-store");
    const preview = await previewResponse.json() as {
      serverNow: string; dueAt: null; options: Record<string, { dueAt: string; intervalDays: number }>;
    };
    assert.equal(preview.dueAt, null);
    assert.equal(preview.options.easy.intervalDays, 4);
    assert.equal(Date.parse(preview.options.again.dueAt) - Date.parse(preview.serverNow), 600_000);

    const input = review();
    const submittedAt = Date.now();
    const response = await post(input);
    assert.equal(response.status, 200);
    const saved = await response.json() as { dueAt: string; repetitions: number };
    assert.equal(saved.repetitions, 1);
    assert.ok(Date.parse(saved.dueAt) >= submittedAt + 4 * day);
    assert.ok(Date.parse(saved.dueAt) <= Date.now() + 4 * day);
    const retries = await Promise.all([post(input), post(input)]);
    for (const retry of retries) assert.deepEqual(await retry.json(), saved);
    assert.equal((await post({ ...input, rating: "again" })).status, 409);
    const early = await post(review({ rating: "hard" }));
    assert.equal((await early.json() as {scheduleUnchanged: boolean}).scheduleUnchanged, true);
    const queueResponse = await fetch(`${baseUrl}/v1/review-queue?${query}`);
    const queue = await queueResponse.json() as { recommendedFen: string; cards: Array<{fen: string; status: string}> };
    assert.ok([secondFen, thirdFen].includes(queue.recommendedFen));
    assert.equal(queue.cards.find(card => card.fen === fen)?.status, "scheduled");

    for (const invalid of [
      { learnerId: "bad" }, { reviewId: "bad" }, { rating: "good" },
      { collection: "../bad" }, { fen: "" }, { fen: "x".repeat(201) },
      { learnerId: null }, { intervalDays: 900 }, { dueAt: new Date().toISOString() },
    ]) assert.equal((await post({ ...review(), ...invalid })).status, 400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post(review({ fen: "unknown" }))).status, 404);
    assert.equal((await post(review({ collection: "unknown" }))).status, 404);
    assert.equal((await fetch(`${baseUrl}/v1/review-options?${new URLSearchParams({ learnerId, collection: "woodpecker", fen: "unknown" })}`)).status, 404);
    for (const endpoint of ["review-options", "review-queue"]) {
      assert.equal((await fetch(`${baseUrl}/v1/${endpoint}`)).status, 400);
      assert.equal((await fetch(`${baseUrl}/v1/${endpoint}?learnerId=bad&collection=woodpecker`)).status, 400);
    }
    for (const body of ["{", JSON.stringify({ ...review(), fen: "x".repeat(5_000) })]) {
      assert.equal((await fetch(`${baseUrl}/v1/reviews`, {
        method: "POST", headers: { "content-type": "application/json" }, body,
      })).status, 400);
    }
    assert.equal((await fetch(`${baseUrl}/v1/reviews`, { method: "POST", body: JSON.stringify(review()) })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
});
