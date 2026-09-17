import assert from "node:assert/strict";
import { test } from "node:test";
import { readStatisticsViewState } from "../src/statisticsViewState";

test("statistics browsing state restores valid fields and rejects malformed history state", () => {
  const defaults = { collection: "", days: 30, filter: "all", sort: "reviews", page: 0 };
  assert.deepEqual(readStatisticsViewState(null), defaults);
  assert.deepEqual(readStatisticsViewState({ collection: "../invalid", days: 1, filter: "unexpected", sort: "unexpected", page: -1 }), defaults);
  assert.deepEqual(readStatisticsViewState({ page: Infinity }), defaults);
  const saved = { collection: "woodpecker", days: 365, filter: "reviewed", sort: "lapses", page: 6 };
  assert.deepEqual(readStatisticsViewState(saved), saved);
});
