import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openDatabase } from "../src/database.js";
import { SolutionRepository } from "../src/repository.js";
import { solutionStoreBatchSchema } from "../src/validation.js";

const fen = "8/8/8/8/8/8/5K2/7k w - - 0 1";
const tree = {
  fen,
  source: "manual",
  quality: { reviewReasons: ["example"] },
  root: {
    choice: "any",
    note: "Preserve position metadata",
    moves: [{ uci: "f2f3", note: "Preserve move metadata", children: [{ moves: [], terminal: "resolved" }] }],
  },
};

function batch(document: unknown) {
  return { collection: "woodpecker", solutions: [{ fen, tree: document }] };
}

test("solution validation preserves metadata, terminal leaves, and UCI promotions", () => {
  assert.deepEqual(solutionStoreBatchSchema.parse(batch(tree)).solutions[0].tree, tree);
  for (const uci of ["e1g1", "a7a8q", "b2b1n", "c7d8r", "d2e1b"]) {
    assert.equal(solutionStoreBatchSchema.safeParse(batch({
      fen, root: { moves: [{ uci, children: [] }] },
    })).success, true, uci);
  }
});

test("solution validation rejects malformed positions and moves recursively", () => {
  const invalidRoots = [
    {}, { moves: [] }, { moves: null }, { moves: {} }, { moves: [null] },
    { moves: [{ children: [] }] }, { moves: [{ uci: 42, children: [] }] },
    ...["", " ", "e2e9", "E2E4", "e2e4qq", "e7e8k", "0000", "Nf3"].map(uci => ({ moves: [{ uci, children: [] }] })),
    { moves: [{ uci: "f2f3" }] },
    { moves: [{ uci: "f2f3", children: {} }] },
    { moves: [{ uci: "f2f3", children: [null] }] },
    { moves: [{ uci: "f2f3", children: [{}] }] },
    { moves: [{ uci: "f2f3", children: [{ moves: [{ uci: "invalid", children: [] }] }] }] },
  ];
  for (const root of invalidRoots) {
    assert.equal(solutionStoreBatchSchema.safeParse(batch({ fen, root })).success, false, JSON.stringify(root));
  }
  assert.equal(solutionStoreBatchSchema.safeParse({
    collection: "woodpecker", solutions: [{ fen: " ", tree: { ...tree, fen: " " } }],
  }).success, false);
});

test("solution validation bounds recursion while allowing long solution lines", () => {
  let root = { moves: [] } as { moves: { uci: string; children: unknown[] }[] };
  for (let ply = 0; ply < 128; ply++) root = { moves: [{ uci: "f2f3", children: [root] }] };
  assert.equal(solutionStoreBatchSchema.safeParse(batch({ fen, root })).success, true);
  root = { moves: [{ uci: "f2f3", children: [root] }] };
  assert.equal(solutionStoreBatchSchema.safeParse(batch({ fen, root })).success, false);
});

test("CLI import uses the solution contract and preserves existing trees on invalid overwrite", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-deck-solution-import-"));
  const databasePath = path.join(directory, "test.sqlite");
  const filePath = path.join(directory, "1.json");
  const runImport = (document: unknown) => {
    writeFileSync(filePath, JSON.stringify(document));
    return spawnSync(process.execPath, ["--import", "tsx", path.resolve("src/importSolutions.ts"), directory], {
      env: { ...process.env, DATABASE_URL: databasePath }, encoding: "utf8",
    });
  };

  try {
    const valid = runImport(tree);
    assert.equal(valid.status, 0, valid.stderr);
    for (const invalid of [
      { fen }, { ...tree, root: {} }, { ...tree, root: { moves: [] } },
      { ...tree, root: { moves: [{ uci: "f2f3", children: [{ moves: [{ uci: "broken", children: [] }] }] }] } },
    ]) {
      const result = runImport(invalid);
      assert.notEqual(result.status, 0, "Malformed solution must fail import");
      const db = openDatabase(databasePath);
      try {
        assert.deepEqual(new SolutionRepository(db).findByFen("woodpecker", fen)?.tree, tree);
      } finally {
        db.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
