import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { openDatabase, type Db } from "../src/database.js";
import { createApp } from "../src/http.js";
import { ReviewRepository, type ReviewInput } from "../src/reviewRepository.js";
import { StatisticsRepository } from "../src/statisticsRepository.js";

const learnerId = randomUUID();
const day = 86_400_000;
const now = Date.parse("2026-09-16T12:00:00.000Z");

function addCard(db: Db, collection: string, fen: string) {
  db.prepare("INSERT INTO collections (collection, fen) VALUES (?, ?)").run(collection, fen);
}

function rate(db: Db, at: number, overrides: Partial<ReviewInput> = {}) {
  const input: ReviewInput = {
    learnerId, reviewId: randomUUID(), collection: "woodpecker", fen: "a", rating: "easy", ...overrides,
  };
  new ReviewRepository(db).save(input, at);
  return input;
}

test("statistics combine rating history and live schedules without duplicate or deleted cards", () => {
  const db = openDatabase(":memory:");
  try {
    for (const fen of ["a", "a", "b", "c", "d"]) addCard(db, "woodpecker", fen);
    addCard(db, "encyclopedia", "a");
    addCard(db, "removed", "a");
    rate(db, now - 40 * day);
    const duplicate = rate(db, now - 2 * day, { rating: "hard" });
    new ReviewRepository(db).save(duplicate, now);
    rate(db, now - day, { fen: "b", rating: "again" });
    rate(db, now, { fen: "c", rating: "again" });
    rate(db, now - day, { collection: "encyclopedia" });
    rate(db, now, { collection: "removed" });
    rate(db, now, { learnerId: randomUUID(), fen: "d" });
    db.prepare("DELETE FROM collections WHERE collection = ?").run("removed");

    const repository = new StatisticsRepository(db);
    const stats = repository.get(learnerId, undefined, 30, "UTC", now);
    assert.equal(stats.serverNow, new Date(now).toISOString());
    assert.deepEqual(stats.summary, {
      reviews: 4, reviewedCards: 4, totalCards: 5, practiceDays: 3,
      dueCards: 1, newCards: 1, scheduledCards: 3,
    });
    assert.deepEqual(stats.ratings, { easy: 1, hard: 1, again: 2 });
    assert.equal(stats.activity.length, 30);
    assert.deepEqual(stats.activity[0], { date: "2026-08-18", count: 0 });
    assert.deepEqual(stats.activity.slice(-3), [
      { date: "2026-09-14", count: 1 }, { date: "2026-09-15", count: 2 }, { date: "2026-09-16", count: 1 },
    ]);
    assert.equal(stats.forecast.length, 14);
    assert.deepEqual(stats.forecast[0], { date: "2026-09-16", count: 1 });
    assert.equal(stats.forecast.reduce((sum, date) => sum + date.count, 0), 3);
    assert.deepEqual(stats.cards.map(card => [card.collection, card.fen, card.positionIndex, card.reviews, card.status]), [
      ["woodpecker", "a", 0, 2, "scheduled"], ["woodpecker", "b", 2, 1, "due"],
      ["woodpecker", "c", 3, 1, "scheduled"], ["woodpecker", "d", 4, 0, "new"],
      ["encyclopedia", "a", 0, 1, "scheduled"],
    ]);
    assert.deepEqual(stats.decks[0], {
      collection: "woodpecker", name: "Woodpecker", reviews: 4, reviewedCards: 3,
      totalCards: 4, dueCards: 1, lastReviewedAt: new Date(now).toISOString(),
    });
    assert.equal(stats.cards[1].lapses, 1);
    assert.equal(stats.cards[3].intervalDays, null);
    assert.equal(stats.cards[3].lastReviewedAt, null);
    assert.equal(stats.cards[3].dueAt, null);

    const filtered = repository.get(learnerId, "woodpecker", 30, "UTC", now);
    assert.equal(filtered.summary.reviews, 3);
    assert.equal(filtered.summary.reviewedCards, 3);
    assert.equal(filtered.cards.length, 4);
    assert.equal(filtered.decks.length, 1);
    assert.equal(repository.get(learnerId, "woodpecker", 90, "UTC", now).summary.reviews, 4);
    assert.equal(repository.get(randomUUID(), undefined, 30, "UTC", now).summary.newCards, 5);
    assert.equal(repository.get(learnerId, "removed", 30, "UTC", now).cards.length, 0);
    db.prepare("DELETE FROM collections WHERE collection = ? AND fen = ?").run("woodpecker", "a");
    assert.equal(repository.get(learnerId, undefined, 30, "UTC", now).summary.reviews, 3);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as {count: number}).count, 7);
  } finally { db.close(); }
});

test("statistics use local calendar days at range boundaries and through daylight saving changes", () => {
  const db = openDatabase(":memory:");
  try {
    addCard(db, "woodpecker", "a");
    const at = (value: string) => Date.parse(value);
    const current = at("2026-03-30T00:30:00Z");
    for (const timestamp of [
      "2026-02-28T22:59:59Z", // Before March 1 in Prague, outside the 30-day period.
      "2026-02-28T23:00:00Z", // March 1, included even though UTC is February.
      "2026-03-28T23:30:00Z", // March 29, before the spring clock change.
      "2026-03-29T21:30:00Z", // Also March 29, after the spring clock change.
      "2026-03-29T22:30:00Z", // March 30 in Prague.
      "2026-03-30T00:30:01Z", // A future timestamp is not counted yet.
    ]) rate(db, at(timestamp));

    const repository = new StatisticsRepository(db);
    const stats = repository.get(learnerId, undefined, 30, "Europe/Prague", current);
    assert.equal(stats.summary.reviews, 4);
    assert.equal(stats.summary.practiceDays, 3);
    assert.deepEqual(stats.activity[0], { date: "2026-03-01", count: 1 });
    assert.deepEqual(stats.activity.slice(-2), [
      { date: "2026-03-29", count: 2 }, { date: "2026-03-30", count: 1 },
    ]);
    assert.equal(stats.cards[0].reviews, 5);
    assert.equal(stats.cards[0].lastReviewedAt, "2026-03-29T22:30:00.000Z");
    db.prepare("UPDATE review_cards SET due_at = ?").run("2026-03-30T22:30:00.000Z");
    assert.deepEqual(repository.get(learnerId, undefined, 30, "Europe/Prague", current).forecast[1],
      { date: "2026-03-31", count: 1 });

    const west = repository.get(learnerId, undefined, 30, "America/Los_Angeles", current);
    assert.equal(west.activity.at(-1)?.date, "2026-03-29");
    assert.equal(west.activity.at(-1)?.count, 2);
    // A later call must not retain the preceding request's time zone formatter.
    assert.deepEqual(repository.get(learnerId, undefined, 30, "Europe/Prague", current).activity, stats.activity);
  } finally { db.close(); }
});

test("empty statistics zero-fill the requested period and exclude overdue cards from the forecast", () => {
  const db = openDatabase(":memory:");
  try {
    const repository = new StatisticsRepository(db);
    const empty = repository.get(learnerId, undefined, 365, "UTC", now);
    assert.equal(empty.activity.length, 365);
    assert.ok(empty.activity.every(date => date.count === 0));
    assert.ok(empty.forecast.every(date => date.count === 0));
    assert.deepEqual(empty.decks, []);
    assert.deepEqual(empty.cards, []);
    assert.equal(empty.summary.reviews, 0);

    for (const fen of ["a", "b", "c"]) addCard(db, "woodpecker", fen);
    for (const fen of ["a", "b", "c"]) rate(db, now, { fen });
    const update = db.prepare("UPDATE review_cards SET due_at = ? WHERE fen = ?");
    update.run(new Date(now).toISOString(), "a");
    update.run("2026-09-29T23:59:59.000Z", "b");
    update.run("2026-09-30T00:00:00.000Z", "c");
    const stats = repository.get(learnerId, undefined, 30, "UTC", now);
    assert.equal(stats.summary.dueCards, 1);
    assert.equal(stats.summary.scheduledCards, 2);
    assert.equal(stats.forecast.reduce((sum, date) => sum + date.count, 0), 1);
    assert.deepEqual(stats.forecast.at(-1), { date: "2026-09-29", count: 1 });
  } finally { db.close(); }
});

test("statistics API validates scope, period, learner and IANA time zone without writing data", async () => {
  const db = openDatabase(":memory:");
  addCard(db, "woodpecker", "a");
  const server = createApp({ host: "127.0.0.1", port: 0, databasePath: ":memory:" }, db);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/statistics`;
  try {
    const response = await fetch(`${baseUrl}?learnerId=${learnerId}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const stats = await response.json() as ReturnType<StatisticsRepository["get"]>;
    assert.equal(stats.days, 30);
    assert.equal(stats.timeZone, "UTC");
    assert.equal(stats.summary.newCards, 1);
    assert.equal(stats.cards[0].collection, "woodpecker");
    const query = new URLSearchParams({ learnerId, collection: "woodpecker", days: "90", timeZone: "Europe/Prague" });
    const scoped = await fetch(`${baseUrl}?${query}`);
    assert.equal(scoped.status, 200);
    assert.equal((await scoped.json() as typeof stats).activity.length, 90);
    for (const suffix of [
      "", "?learnerId=invalid", `?learnerId=${learnerId}&learnerId=${learnerId}`,
      `?learnerId=${learnerId}&collection=../bad`, `?learnerId=${learnerId}&collection=`,
      `?learnerId=${learnerId}&collection=woodpecker&collection=encyclopedia`,
      `?learnerId=${learnerId}&days=31`, `?learnerId=${learnerId}&days=30&days=90`,
      `?learnerId=${learnerId}&timeZone=invalid`, `?learnerId=${learnerId}&timeZone=%2B01:00`,
      `?learnerId=${learnerId}&timeZone=UTC&timeZone=Europe/Prague`, `?learnerId=${learnerId}&unexpected=1`,
    ]) assert.equal((await fetch(`${baseUrl}${suffix}`)).status, 400, suffix);
    for (const table of ["review_cards", "review_events"]) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {count: number}).count, 0);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
});
