import assert from "node:assert/strict";
import { test } from "node:test";
import { fitMoveMenu, focusMoveMenuItem, revealNotationMove } from "../src/notationInteractions.ts";

test("revealing notation only scrolls its own pane, even when that pane is below the viewport", () => {
  const pane = {
    clientTop: 1, clientLeft: 1, clientHeight: 100, clientWidth: 180,
    scrollTop: 40, scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 1200, left: 20 }),
  };
  let moveBounds = { top: 1300, bottom: 1327, left: 25, right: 80 };
  const move = {
    getBoundingClientRect: () => moveBounds,
    scrollIntoView: () => assert.fail("scrollIntoView must never scroll the document"),
  };
  const reveal = () => revealNotationMove(pane as unknown as HTMLElement, move as unknown as HTMLElement);
  reveal();
  assert.equal(pane.scrollTop, 66);
  assert.equal(pane.scrollLeft, 0);
  moveBounds = { top: 1210, bottom: 1237, left: 25, right: 80 };
  reveal();
  assert.equal(pane.scrollTop, 66, "an already visible move must not scroll");
  moveBounds = { top: 1181, bottom: 1208, left: 210, right: 250 };
  reveal();
  assert.equal(pane.scrollTop, 46);
  assert.equal(pane.scrollLeft, 49);
});

test("the menu fits the usable viewport at both edges and after resizing", () => {
  const menu = {
    style: { left: "", top: "", maxWidth: "", maxHeight: "" },
    getBoundingClientRect() {
      return { width: Math.min(142, parseFloat(this.style.maxWidth)), height: Math.min(110, parseFloat(this.style.maxHeight)) };
    },
  };
  const place = (x: number, y: number, viewport: { left: number; top: number; width: number; height: number }) =>
    fitMoveMenu(menu as unknown as HTMLElement, x, y, viewport);
  place(298, 590, { left: 0, top: 0, width: 305, height: 600 });
  assert.equal(menu.style.left, "155px", "305px usable width models a 320px viewport with a scrollbar");
  assert.equal(menu.style.top, "482px");
  place(-20, -10, { left: 0, top: 0, width: 305, height: 600 });
  assert.equal(menu.style.left, "8px");
  assert.equal(menu.style.top, "8px");
  place(298, 590, { left: 20, top: 120, width: 200, height: 80 });
  assert.equal(menu.style.left, "70px");
  assert.equal(menu.style.top, "128px");
  assert.equal(menu.style.maxHeight, "64px", "short viewports leave an internally scrollable menu");
});

test("menu keys wrap enabled items and focus without moving the page", () => {
  let focused: object | null = null;
  const items = Array.from({ length: 2 }, () => ({ focus(options: FocusOptions) {
    assert.deepEqual(options, { preventScroll: true });
    focused = this;
  } }));
  const menu = { querySelectorAll(selector: string) {
    assert.equal(selector, '[role="menuitem"]:not(:disabled)');
    return items;
  } } as unknown as HTMLElement;
  const press = (key: string) => focusMoveMenuItem(menu, key, focused as Element | null);
  assert.equal(press("Home"), true);
  assert.equal(focused, items[0]);
  press("ArrowUp");
  assert.equal(focused, items[1]);
  press("ArrowDown");
  assert.equal(focused, items[0]);
  press("End");
  assert.equal(focused, items[1]);
  assert.equal(press("Enter"), false, "activation remains native button behavior");
});
