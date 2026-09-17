import assert from "node:assert/strict";
import { test } from "node:test";
import { syncBoardMotion } from "../src/boardMotion.ts";

test("board motion follows the initial preference and changes until unmounted", () => {
  for (const initiallyReduced of [true, false]) {
    const listeners = new Set<() => void>();
    const media = {
      matches: initiallyReduced,
      addEventListener(event: string, listener: () => void) {
        assert.equal(event, "change");
        listeners.add(listener);
      },
      removeEventListener(event: string, listener: () => void) {
        assert.equal(event, "change");
        listeners.delete(listener);
      },
    };
    const previousWindow = globalThis.window;
    globalThis.window = {
      matchMedia(query: string) {
        assert.equal(query, "(prefers-reduced-motion: reduce)");
        return media;
      },
    } as unknown as Window & typeof globalThis;
    try {
      const animations: boolean[] = [];
      const unsubscribe = syncBoardMotion({
        set(config) { animations.push(config.animation!.enabled!); },
      });
      assert.deepEqual(animations, [!initiallyReduced]);
      assert.equal(listeners.size, 1);

      media.matches = !initiallyReduced;
      listeners.forEach(listener => listener());
      assert.deepEqual(animations, [!initiallyReduced, initiallyReduced]);

      unsubscribe();
      assert.equal(listeners.size, 0);
      media.matches = initiallyReduced;
      listeners.forEach(listener => listener());
      assert.equal(animations.length, 2);
    } finally {
      globalThis.window = previousWindow;
    }
  }
});
