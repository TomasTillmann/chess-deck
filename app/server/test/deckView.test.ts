import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openDatabase, type Db } from "../src/database.js";
import { DeckViewRepository, DeckViewCollectionsError, type DeckView } from "../src/deckViewRepository.js";
import { createApp } from "../src/http.js";
import { ReviewRepository } from "../src/reviewRepository.js";

const learnerId = randomUUID();
const fen = "8/8/8/8/8/8/5K2/6k1 w - - 0 1";

function seed(db: Db) {
  const insert = db.prepare("INSERT INTO collections (collection, fen) VALUES (?, ?)");
  for (const collection of ["woodpecker", "encyclopedia", "endgame-basics"]) insert.run(collection, fen);
}

test("deck views persist metadata, canonicalize selections and preserve renames across retries", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-deck-view-"));
  const filename = path.join(directory, "test.sqlite");
  let db = openDatabase(filename);
  try {
    seed(db);
    let repository = new DeckViewRepository(db);
    const created = repository.create(learnerId, ["woodpecker", "encyclopedia", "woodpecker"]);
    assert.equal(created.name, "Encyclopedia of Chess Combinations + Woodpecker");
    assert.deepEqual(created.collections, ["encyclopedia", "woodpecker"]);
    assert.ok(Number.isFinite(Date.parse(created.createdAt)));
    assert.equal(created.createdAt, created.updatedAt);
    const renamed = repository.rename(learnerId, created.id, "My practice")!;
    assert.equal(renamed.name, "My practice");
    assert.equal(renamed.createdAt, created.createdAt);
    assert.deepEqual(repository.create(learnerId, ["encyclopedia", "woodpecker"]), renamed);
    assert.equal(repository.create(learnerId, ["endgame-basics"]).name, "Endgame Basics");
    assert.throws(() => repository.create(learnerId, []), DeckViewCollectionsError);
    assert.throws(() => repository.create(learnerId, ["woodpecker", "unknown"]), DeckViewCollectionsError);
    assert.equal(repository.list(learnerId).length, 2);

    db.close();
    db = openDatabase(filename);
    repository = new DeckViewRepository(db);
    assert.deepEqual(repository.find(learnerId, created.id), renamed);
    assert.deepEqual(repository.create(learnerId, ["woodpecker", "encyclopedia"]), renamed);
    assert.equal(repository.list(learnerId).length, 2);

    const otherLearner = randomUUID();
    assert.deepEqual(repository.list(otherLearner), []);
    assert.equal(repository.find(otherLearner, created.id), null);
    assert.equal(repository.rename(otherLearner, created.id, "Stolen"), null);
    assert.equal(repository.delete(otherLearner, created.id), false);
    assert.deepEqual(repository.find(learnerId, created.id), renamed);
    assert.notEqual(repository.create(otherLearner, created.collections).id, created.id);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("views reflect live source cards and deletion never changes source decks or reviews", () => {
  const db = openDatabase(":memory:");
  try {
    seed(db);
    const views = new DeckViewRepository(db);
    const reviews = new ReviewRepository(db);
    const now = Date.parse("2026-09-17T12:00:00.000Z");
    const view = views.create(learnerId, ["woodpecker", "encyclopedia"]);
    reviews.save({ learnerId, reviewId: randomUUID(), collection: "woodpecker", fen, rating: "easy" }, now);
    const queue = () => reviews.queue(learnerId, views.find(learnerId, view.id)!.collections, now);
    assert.deepEqual(queue().cards.map(card => [card.collection, card.status]), [
      ["encyclopedia", "new"], ["woodpecker", "scheduled"],
    ]);
    const changedFen = fen.replace("0 1", "1 1");
    db.prepare("UPDATE collections SET fen = ? WHERE collection = ?").run(changedFen, "encyclopedia");
    assert.equal(queue().recommendedFen, changedFen);
    db.prepare("DELETE FROM collections WHERE collection = ?").run("encyclopedia");
    assert.equal(queue().cards.length, 1);
    assert.deepEqual(views.create(learnerId, view.collections), view); // Retrying an existing view still works.
    db.prepare("DELETE FROM collections WHERE collection = ?").run("woodpecker");
    assert.deepEqual(queue().cards, []); // An empty saved view cannot fall back to Practice All.
    assert.deepEqual(views.find(learnerId, view.id), view);

    const sources = () => ["collections", "review_cards", "review_events"].map(table =>
      db.prepare(`SELECT * FROM ${table}`).all());
    const before = sources();
    assert.equal(views.delete(learnerId, view.id), true);
    assert.equal(views.delete(learnerId, view.id), false);
    assert.deepEqual(views.list(learnerId), []);
    assert.deepEqual(sources(), before);
  } finally { db.close(); }
});

test("deck view API validates inputs, isolates learners, safely retries and supports rename/delete", async () => {
  const db = openDatabase(":memory:");
  seed(db);
  const server = createApp({ host: "127.0.0.1", port: 0, databasePath: ":memory:" }, db);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/deck-views`;
  const write = (method: string, body: unknown, id = "") => fetch(`${baseUrl}${id ? `/${id}` : ""}`, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const get = (id = "", learner = learnerId) => fetch(`${baseUrl}${id ? `/${id}` : ""}?learnerId=${learner}`);
  try {
    assert.deepEqual(await (await get()).json(), { views: [] });
    const response = await write("POST", { learnerId, collections: ["woodpecker", "encyclopedia"] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const created = await response.json() as DeckView;
    const renamedResponse = await write("PATCH", { learnerId, name: "  Daily tactics  " }, created.id);
    assert.equal(renamedResponse.status, 200);
    const renamed = await renamedResponse.json() as DeckView;
    assert.equal(renamed.name, "Daily tactics");
    const retries = await Promise.all(["woodpecker", "encyclopedia"].map(first => write("POST", {
      learnerId, collections: [first, "woodpecker", "encyclopedia"],
    })));
    for (const retry of retries) assert.deepEqual(await retry.json(), renamed);
    assert.deepEqual(await (await get(created.id)).json(), renamed);
    assert.deepEqual(await (await get()).json(), { views: [renamed] });

    const otherLearner = randomUUID();
    assert.deepEqual(await (await get("", otherLearner)).json(), { views: [] });
    assert.equal((await get(created.id, otherLearner)).status, 404);
    assert.equal((await write("PATCH", { learnerId: otherLearner, name: "Changed" }, created.id)).status, 404);
    assert.equal((await fetch(`${baseUrl}/${created.id}?learnerId=${otherLearner}`, { method: "DELETE" })).status, 404);
    assert.deepEqual(await (await get(created.id)).json(), renamed);

    for (const invalid of [
      {}, { learnerId: "bad", collections: ["woodpecker"] }, { learnerId, collections: [] },
      { learnerId, collections: "woodpecker" }, { learnerId, collections: ["../bad"] },
      { learnerId, collections: [null] }, { learnerId, collections: ["unknown"] },
      { learnerId, collections: ["woodpecker", "unknown"] },
      { learnerId, collections: Array(1_001).fill("woodpecker") },
      { learnerId, collections: ["woodpecker"], name: "Unexpected" },
    ]) assert.equal((await write("POST", invalid)).status, 400);
    for (const name of ["", "   ", "x".repeat(201), null, 4]) {
      assert.equal((await write("PATCH", { learnerId, name }, created.id)).status, 400);
    }
    assert.equal((await write("PATCH", { learnerId, name: "Good", collections: [] }, created.id)).status, 400);
    assert.equal((await write("PATCH", { learnerId, name: "Good" }, randomUUID())).status, 404);
    for (const suffix of ["", "?learnerId=bad", `?learnerId=${learnerId}&learnerId=${learnerId}`]) {
      assert.equal((await fetch(`${baseUrl}${suffix}`)).status, 400);
    }
    assert.equal((await get("bad-id")).status, 400);
    assert.equal((await get(randomUUID())).status, 404);
    for (const body of ["{", JSON.stringify({ learnerId, collections: ["x".repeat(100_001)] })]) {
      assert.equal((await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json" }, body })).status, 400);
    }
    assert.equal((await fetch(baseUrl, { method: "POST", body: "{}" })).status, 400);
    const preflight = await fetch(`${baseUrl}/${created.id}`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods")!, /PATCH/);
    assert.match(preflight.headers.get("access-control-allow-methods")!, /DELETE/);

    const deleted = await fetch(`${baseUrl}/${created.id}?learnerId=${learnerId}`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), "");
    assert.equal((await get(created.id)).status, 404);
    assert.deepEqual(await (await get()).json(), { views: [] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
});
