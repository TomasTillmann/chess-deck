import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mock, test } from "node:test";
import type { Deck } from "../src/decks";

const requests: { kind: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
let writes: { target: string; value: unknown }[] = [];
let stateIndex = 0;
let effects: (() => (() => void) | void)[] = [];
let historyState: Record<string, unknown> = {};
Object.defineProperty(globalThis, "window", { configurable: true, value: {
  location: { hash: "#/statistics" },
  history: {
    get state() { return historyState; },
    replaceState(value: Record<string, unknown>) { historyState = value; },
  },
} });

registerHooks({ resolve(specifier, context, nextResolve) {
  if (["../design-system", "../components/CardStatisticsTable", "./StatisticsPage.css"].includes(specifier)) {
    return { url: "data:text/javascript,export const BarChart=()=>null, Button=()=>null, MetricStrip=()=>null, PageHeader=()=>null, RatingBreakdown=()=>null, StatusMessage=()=>null, CardStatisticsTable=()=>null;", shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

mock.module("react", { namedExports: {
  useState: (value: unknown) => {
    const target = ["selection", "revision", "response", "error", "loading"][stateIndex++];
    return [typeof value === "function" ? value() : value, (next: unknown) => writes.push({ target, value: next })];
  },
  useEffect: (effect: () => (() => void) | void) => effects.push(effect),
} });
mock.module("react/jsx-runtime", { namedExports: { jsx: () => null, jsxs: () => null, Fragment: Symbol() } });
mock.module("../src/decks.ts", { namedExports: {
  fetchDecks: (signal: AbortSignal) => new Promise(resolve => requests.push({ kind: "catalog", signal, resolve })),
} });
mock.module("../src/statisticsClient.ts", { namedExports: {
  chartPoints: () => [],
  fetchStatistics: (_collection: string, _days: number, signal: AbortSignal) =>
    new Promise(resolve => requests.push({ kind: "statistics", signal, resolve })),
} });

const { StatisticsPage } = await import("../src/pages/StatisticsPage.tsx");
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

function startRefresh() {
  stateIndex = 0;
  effects = [];
  StatisticsPage({ decks: [], onDecksChange: (value: Deck[]) => writes.push({ target: "catalog", value }) });
  return effects[1]() as () => void;
}

test("statistics publish the refreshed catalog with their data and ignore aborted older requests", async () => {
  const abortOld = startRefresh();
  const old = requests.splice(0);
  assert.deepEqual(old.map(request => request.kind), ["catalog", "statistics"]);
  assert.equal(old[0].signal, old[1].signal);
  abortOld();
  assert.equal(old[0].signal.aborted, true);

  const abortCurrent = startRefresh();
  assert.equal(writes.some(write => write.target === "response"), false, "refresh keeps previously loaded data mounted");
  const current = requests.splice(0);
  writes = [];
  try {
    const statistics = { cards: [{ positionIndex: 1, fen: "added" }] };
    current[1].resolve(statistics);
    await flushPromises();
    assert.deepEqual(writes, [], "statistics must wait for their current catalog");

    const catalog = [{ slug: "test", fens: ["old", "added"] }];
    current[0].resolve(catalog);
    await flushPromises();
    assert.deepEqual(writes, [
      { target: "catalog", value: catalog },
      { target: "response", value: { collection: "", days: 30, data: statistics } },
      { target: "loading", value: false },
    ]);

    old[0].resolve([{ slug: "outdated", fens: ["removed"] }]);
    old[1].resolve({ cards: [] });
    await flushPromises();
    assert.equal(writes.length, 3, "late aborted responses cannot replace either catalog or statistics");
  } finally { abortCurrent(); }
});

test("statistics restores the history entry selection and preserves navigation state when saving it", () => {
  const selection = { collection: "woodpecker", days: 90, filter: "new", sort: "position", page: 3 };
  historyState = { statistics: selection, scroll: { x: 0, y: 400 } };
  stateIndex = 0;
  effects = [];
  StatisticsPage({ decks: [], onDecksChange: () => {} });
  effects[0]();
  assert.deepEqual(historyState, { statistics: selection, scroll: { x: 0, y: 400 } });
});
