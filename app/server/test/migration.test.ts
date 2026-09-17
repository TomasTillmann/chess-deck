import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import Database from "better-sqlite3";
import { openDatabase } from "../src/database.js";

const rows = [
  { id: "first fen", collection: "woodpecker", tree: '{"moves":[]}' },
  { id: "first fen", collection: "encyclopedia", tree: '{"moves":["e2e4"]}' },
];

function legacyDatabase(t: TestContext): string {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-deck-migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "legacy.sqlite");
  const db = new Database(databasePath);
  try {
    db.exec(`
      CREATE TABLE solutions (
        id TEXT NOT NULL,
        collection TEXT NOT NULL,
        tree TEXT NOT NULL CHECK (json_valid(tree)),
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX solutions_collection_idx ON solutions (collection);
    `);
    const insert = db.prepare("INSERT INTO solutions (id, collection, tree) VALUES (@id, @collection, @tree)");
    rows.forEach(row => insert.run(row));
  } finally {
    db.close();
  }
  return databasePath;
}

test("legacy solutions migration preserves rows and the collection index", t => {
  const databasePath = legacyDatabase(t);
  const db = openDatabase(databasePath);
  try {
    assert.deepEqual(db.prepare("SELECT fen AS id, collection, tree FROM solutions ORDER BY collection DESC").all(), rows);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'solutions_old'").get(), undefined);
    assert.deepEqual(db.prepare("PRAGMA index_info(solutions_collection_idx)").all(), [
      { seqno: 0, cid: 1, name: "collection" },
    ]);
  } finally {
    db.close();
  }
  const reopened = openDatabase(databasePath);
  try {
    assert.equal(reopened.prepare("SELECT count(*) AS count FROM solutions").get().count, rows.length);
  } finally {
    reopened.close();
  }
});

test("failed legacy solutions migration rolls back the table, rows, and index", t => {
  const databasePath = legacyDatabase(t);
  const db = new Database(databasePath);
  try {
    db.pragma("ignore_check_constraints = ON");
    db.prepare("UPDATE solutions SET tree = ? WHERE collection = ?").run("invalid JSON", "encyclopedia");
    db.pragma("ignore_check_constraints = OFF");
    const before = db.prepare("SELECT * FROM solutions ORDER BY collection").all();
    const schemaBefore = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'solutions'").get();

    assert.throws(() => openDatabase(databasePath), /CHECK constraint failed/);

    assert.deepEqual(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'solutions'").get(), schemaBefore);
    assert.deepEqual(db.prepare("SELECT * FROM solutions ORDER BY collection").all(), before);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'solutions_old'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT tbl_name FROM sqlite_master WHERE name = 'solutions_collection_idx'").get(), {
      tbl_name: "solutions",
    });
  } finally {
    db.close();
  }
});
