import assert from "node:assert/strict";
import { test } from "node:test";
import { navigationScroll, navigateToPosition, routeFromHash } from "../src/routing";
import type { Deck } from "../src/decks";

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
  assert.deepEqual(parseHash("#/statistics"), { view: "statistics" });
  assert.deepEqual(parseHash("#/practice"), { view: "practice" });
  assert.deepEqual(parseHash("#/views/abc-123/practice"), { view: "practice", viewId: "abc-123" });
  assert.deepEqual(parseHash("#/unknown/%"), { view: "decks" });
});

test("only automatic next-card navigation explicitly preserves the viewport", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events: CustomEvent[] = [];
  const location = { hash: "#/decks/test" };
  const pushes: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location,
    history: { pushState: (_state: unknown, _title: string, hash: string) => pushes.push(hash) },
    dispatchEvent: (event: CustomEvent) => events.push(event),
  } });
  try {
    const deck = { slug: "test" } as Deck;
    navigateToPosition(deck, 2);
    assert.equal(location.hash, "#/decks/test/positions/3");
    assert.deepEqual(events, []);
    navigateToPosition(deck, 4, true);
    assert.deepEqual(pushes, ["#/decks/test/positions/5"]);
    assert.equal(events[0].type, "hashchange");
    assert.deepEqual(events[0].detail, { preserveScroll: true });
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("new routes start at the top, history restores its position, and rated cards stay put", () => {
  const event = new Event("hashchange");
  assert.deepEqual(navigationScroll(event, undefined), { top: 0, left: 0 });
  assert.deepEqual(navigationScroll(event, { top: 2400, left: 0 }), { top: 2400, left: 0 });
  for (const saved of [null, {}, { top: NaN, left: 0 }, { top: -1, left: 0 }, { top: 5, left: Infinity }]) {
    assert.deepEqual(navigationScroll(event, saved), { top: 0, left: 0 });
  }
  assert.equal(navigationScroll(new CustomEvent("hashchange", { detail: { preserveScroll: true } }), { top: 200, left: 0 }), undefined);
});
