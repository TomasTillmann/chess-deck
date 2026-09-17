import assert from "node:assert/strict";
import { test } from "node:test";
import { chartPoints, fetchStatistics } from "../src/statisticsClient";

test("weekly activity keeps every review, including the last partial week", () => {
  const days = Array.from({ length: 16 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, count: index }));
  const weekly = chartPoints(days, true);
  assert.deepEqual(weekly.map(point => point.value), [21, 70, 29]);
  assert.equal(weekly.reduce((sum, point) => sum + point.value, 0), 120);
  assert.equal(chartPoints(days).length, 16);
  assert.deepEqual(chartPoints([], true), []);
});

test("statistics requests carry learner, scope, period, timezone and cancellation", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalFetch = globalThis.fetch;
  const id = "2ccbd6a4-e3ae-49c4-b346-9ca68e12d0cb";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => id } });
  const signal = new AbortController().signal;
  const urls: URL[] = [];
  globalThis.fetch = async (input, options) => {
    urls.push(new URL(String(input)));
    assert.equal(options?.signal, signal);
    return new Response(JSON.stringify({ marker: "statistics" }));
  };
  try {
    await fetchStatistics("woodpecker", 90, signal);
    await fetchStatistics("", 30, signal);
    assert.equal(urls[0].pathname, "/v1/statistics");
    assert.equal(urls[0].searchParams.get("learnerId"), id);
    assert.equal(urls[0].searchParams.get("collection"), "woodpecker");
    assert.equal(urls[0].searchParams.get("days"), "90");
    assert.equal(urls[0].searchParams.get("timeZone"), Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.equal(urls[1].searchParams.has("collection"), false);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(fetchStatistics("", 30), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
