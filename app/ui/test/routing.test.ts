import assert from "node:assert/strict";
import { test } from "node:test";
import { routeFromHash } from "../src/routing";

function parseHash(hash: string) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash } } });
  try {
    return routeFromHash();
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

for (const encodedSlug of ["%", "%zz", "%C3%28", "%E0%A4%A"]) {
  test(`malformed slug ${encodedSlug} falls back to Decks on both deck routes`, () => {
    assert.deepEqual(parseHash(`#/decks/${encodedSlug}`), { view: "decks" });
    assert.deepEqual(parseHash(`#/decks/${encodedSlug}/positions/2`), { view: "decks" });
  });
}

test("valid encoded deck slugs retain their decoded value and position", () => {
  const slug = "České úlohy / endgames 100%";
  const encoded = encodeURIComponent(slug);
  assert.deepEqual(parseHash(`#/decks/${encoded}`), { view: "deck", slug });
  assert.deepEqual(parseHash(`#/decks/${encoded}/positions/2`), { view: "position", slug, positionIndex: 1 });
});

test("other supported routes and unknown route fallback are unchanged", () => {
  assert.deepEqual(parseHash("#/views"), { view: "views" });
  assert.deepEqual(parseHash("#/practice"), { view: "practice" });
  assert.deepEqual(parseHash("#/views/abc-123/practice"), { view: "practice", viewId: "abc-123" });
  assert.deepEqual(parseHash("#/unknown/%"), { view: "decks" });
});
