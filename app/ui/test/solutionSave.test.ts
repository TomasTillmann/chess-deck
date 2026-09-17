import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { SolutionDocument } from "../src/solutionClient.ts";

type Effect = { deps: unknown[]; cleanup?: () => void };
let current: ReturnType<typeof solverHarness>;
const saves: { resolve: () => void; reject: (error: Error) => void }[] = [];
let loadSolution: () => Promise<SolutionDocument> = async () => ({});
class SolutionFetchError extends Error {
  constructor(readonly status: number) { super(`Solution request failed: ${status}`); }
}

mock.module("react", {
  namedExports: {
    useState: (value: unknown) => current.state(value),
    useRef: (value: unknown) => current.ref(value),
    useEffect: (effect: () => (() => void) | void, deps: unknown[]) => current.effect(effect, deps),
    useCallback: (callback: unknown) => callback,
    useMemo: (calculate: () => unknown) => calculate(),
  },
});
mock.module("../src/solutionClient.ts", {
  namedExports: {
    SolutionFetchError,
    fetchSolution: () => loadSolution(),
    updateSolution: () => new Promise<void>((resolve, reject) => saves.push({ resolve, reject })),
  },
});

const { usePuzzleSolver } = await import("../src/hooks/usePuzzleSolver.ts");
const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const deck = { slug: "test", previewFen: fen, fens: [fen] };
globalThis.window = { addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;

function solverHarness() {
  const slots: any[] = [];
  let index = 0;
  let changed = false;
  let unmounted = false;
  let writesAfterUnmount = 0;
  let effects: (() => void)[] = [];
  return {
    state(value: unknown) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = value;
      return [slots[slot], (next: any) => {
        if (unmounted) writesAfterUnmount += 1;
        slots[slot] = typeof next === "function" ? next(slots[slot]) : next;
        changed = true;
      }];
    },
    ref(value: unknown) {
      const slot = index++;
      return slots[slot] ??= { current: value };
    },
    effect(effect: () => (() => void) | void, deps: unknown[]) {
      const slot = index++;
      const previous: Effect | undefined = slots[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const next: Effect = { deps };
        slots[slot] = next;
        effects.push(() => { previous?.cleanup?.(); next.cleanup = effect() || undefined; });
      }
    },
    render() {
      let result: ReturnType<typeof usePuzzleSolver>;
      do {
        current = this;
        index = 0;
        changed = false;
        result = usePuzzleSolver(deck as Parameters<typeof usePuzzleSolver>[0], 0);
        const pending = effects;
        effects = [];
        pending.forEach(effect => effect());
      } while (changed);
      return result;
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
      unmounted = true;
    },
    get writesAfterUnmount() { return writesAfterUnmount; },
  };
}

test("editing during a save keeps it pending, blocks overlap, and leaves newer edits unsaved", async () => {
  saves.length = 0;
  const harness = solverHarness();
  let solver = harness.render();
  solver.handleMove("e2", "e4");
  solver = harness.render();
  const pending = solver.handleUpdateSolution();
  const duplicate = solver.handleUpdateSolution();
  assert.equal(saves.length, 1);
  await duplicate;
  solver.handleMove("e7", "e5");
  solver = harness.render();
  assert.equal(solver.updateState.status, "loading");
  await solver.handleUpdateSolution();
  assert.equal(saves.length, 1);
  saves[0].resolve();
  await pending;
  assert.equal(harness.render().updateState.status, "idle");

  const fresh = harness.render().handleUpdateSolution();
  assert.equal(saves.length, 2);
  saves[1].resolve();
  await fresh;
  assert.equal(harness.render().updateState.status, "success");
  harness.unmount();
});

test("failed saves release the pending request for retry", async () => {
  saves.length = 0;
  const harness = solverHarness();
  const pending = harness.render().handleUpdateSolution();
  saves[0].reject(new Error("offline"));
  await pending;
  assert.equal(harness.render().updateState.status, "error");
  const retry = harness.render().handleUpdateSolution();
  saves[1].resolve();
  await retry;
  assert.equal(harness.render().updateState.status, "success");
  harness.unmount();
});

test("an edited snapshot's failure leaves newer edits idle and allows another save", async () => {
  saves.length = 0;
  const harness = solverHarness();
  const solver = harness.render();
  const pending = solver.handleUpdateSolution();
  solver.handleMove("e2", "e4");
  assert.equal(harness.render().updateState.status, "loading");
  saves[0].reject(new Error("offline"));
  await pending;
  assert.equal(harness.render().updateState.status, "idle");
  const retry = harness.render().handleUpdateSolution();
  saves[1].resolve();
  await retry;
  assert.equal(harness.render().updateState.status, "success");
  harness.unmount();
});

for (const fails of [false, true]) {
  test(`a previous attempt's save ${fails ? "failure" : "success"} cannot update an unmounted solver`, async () => {
    saves.length = 0;
    const previous = solverHarness();
    const pending = previous.render().handleUpdateSolution();
    previous.unmount();
    const fresh = solverHarness();
    assert.equal(fresh.render().updateState.status, "idle");
    if (fails) saves[0].reject(new Error("offline"));
    else saves[0].resolve();
    await pending;
    assert.equal(previous.writesAfterUnmount, 0);
    assert.equal(fresh.render().updateState.status, "idle");
    fresh.unmount();
  });
}

test("submitting without a saved solution permits self-rating without inventing a score", async () => {
  loadSolution = async () => { throw new SolutionFetchError(404); };
  const harness = solverHarness();
  assert.equal(harness.render().canRate, false);
  const pending = harness.render().handleSubmit();
  assert.equal(harness.render().canRate, true, "comparison must not delay self-rating");
  await pending;
  const solver = harness.render();
  assert.deepEqual(solver.submitState, { status: "ungraded" });
  assert.equal(solver.canRate, true);
  assert.equal(solver.canUpdateSolution, true, "a confirmed missing solution may be created");
  assert.equal(solver.game.root.children.length, 0, "submission without moves is still an attempt");
  harness.unmount();
});

for (const failure of ["network", "server", "invalid solution"] as const) {
  test(`${failure} keeps self-rating available and allows comparison retry`, async () => {
    loadSolution = async () => {
      if (failure === "invalid solution") return {};
      throw failure === "network" ? new Error("offline") : new SolutionFetchError(500);
    };
    const harness = solverHarness();
    harness.render().handleMove("e2", "e4");
    await harness.render().handleSubmit();
    const solver = harness.render();
    assert.equal(solver.submitState.status, "error");
    assert.equal(solver.canRate, true);
    assert.equal(solver.canUpdateSolution, failure === "invalid solution", "a failed read cannot enable overwriting an unknown solution");
    loadSolution = async () => ({ fen, root: { moves: [{ uci: "e2e4", children: [] }] } });
    await solver.handleSubmit();
    assert.deepEqual(harness.render().submitState, { status: "success", score: 100 });
    assert.equal(harness.render().canRate, true);
    harness.unmount();
  });
}

test("editing or leaving during comparison cannot reveal ratings for a stale attempt", async () => {
  for (const leave of [false, true]) {
    let reject!: (error: Error) => void;
    loadSolution = () => new Promise((_, onReject) => { reject = onReject; });
    const harness = solverHarness();
    const pending = harness.render().handleSubmit();
    if (leave) harness.unmount();
    else {
      harness.render().handleMove("e2", "e4");
      assert.equal(harness.render().canRate, false);
    }
    reject(new SolutionFetchError(404));
    await pending;
    if (leave) assert.equal(harness.writesAfterUnmount, 0);
    else {
      assert.deepEqual(harness.render().submitState, { status: "idle" });
      assert.equal(harness.render().canRate, false);
      harness.unmount();
    }
  }
});
