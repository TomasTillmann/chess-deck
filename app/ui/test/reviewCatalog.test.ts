import assert from "node:assert/strict";
import test from "node:test";
import { loadDeckReview } from "../src/reviewCatalog.ts";
import type { Deck } from "../src/decks.ts";
import type { ReviewQueue } from "../src/reviewClient.ts";

const original: Deck = {
  slug: "practice", name: "Practice", description: "", fens: ["first"],
  previewFen: "first", accentColor: "blue",
};
const queue: ReviewQueue = {
  serverNow: "2026-09-17T12:00:00Z", cards: [], recommendedFen: "added", nextDueAt: null,
};

test("a queue recommendation added to the live catalog is available to the gallery and solver", async () => {
  const updated = { ...original, fens: ["first", "added"] };
  let catalogLoads = 0;
  const result = await loadDeckReview(original.slug, async () => {
    catalogLoads++;
    return [updated];
  }, async collection => {
    assert.equal(collection, original.slug);
    return queue;
  });
  assert.equal(catalogLoads, 1);
  assert.deepEqual(result.decks, [updated]);
  assert.equal(result.deck.fens[result.recommendedIndex], "added");
  assert.equal(result.recommendedIndex, 1);
});

test("caught-up refresh retains the completed FEN's identity after source reordering", async () => {
  const updated = { ...original, fens: ["added", "first"] };
  const result = await loadDeckReview(original.slug, async () => [updated], async () => ({ ...queue, recommendedFen: null }));
  assert.equal(result.recommendedIndex, -1);
  assert.equal(result.deck.fens.indexOf(original.fens[0]), 1);
  assert.deepEqual(result.decks, [updated]);
});

test("unavailable recommendations and removed source decks are errors, not caught-up results", async () => {
  await assert.rejects(loadDeckReview(original.slug, async () => [original], async () => queue), /Recommended position is unavailable/);
  await assert.rejects(loadDeckReview(original.slug, async () => [], async () => ({ ...queue, recommendedFen: null })), /Deck is unavailable/);
});

test("retry reloads both catalog and queue after a failed refresh", async () => {
  let catalogLoads = 0;
  let queueLoads = 0;
  const loadCatalog = async () => {
    catalogLoads++;
    if (catalogLoads === 1) throw new Error("Catalog temporarily unavailable");
    return [{ ...original, fens: ["added", "first"] }];
  };
  const loadQueue = async () => { queueLoads++; return queue; };
  await assert.rejects(loadDeckReview(original.slug, loadCatalog, loadQueue), /Catalog temporarily unavailable/);
  const result = await loadDeckReview(original.slug, loadCatalog, loadQueue);
  assert.equal(catalogLoads, 2);
  assert.equal(queueLoads, 2);
  assert.equal(result.recommendedIndex, 0);
});
