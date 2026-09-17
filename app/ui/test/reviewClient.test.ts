import assert from "node:assert/strict";
import test from "node:test";
import { saveReview } from "../src/reviewClient.ts";

test("each review rating sends only identifiers and the rating, never coverage or move trees", async t => {
  const learnerId = "11111111-1111-4111-8111-111111111111";
  const reviewId = "22222222-2222-4222-8222-222222222222";
  const collection = "test-deck";
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => {
      assert.equal(key, "woodpecker.learnerId");
      return learnerId;
    } },
  });
  t.after(() => {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  const requests: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    assert.equal(url.pathname, "/v1/reviews");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "content-type": "application/json" });
    requests.push(JSON.parse(init.body as string));
    return Response.json({});
  });

  for (const rating of ["easy", "hard", "again"] as const) {
    await saveReview(collection, fen, reviewId, rating);
  }

  assert.deepEqual(requests, ["easy", "hard", "again"].map(rating => ({
    learnerId, reviewId, collection, fen, rating,
  })));
});
