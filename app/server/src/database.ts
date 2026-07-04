import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDatabase(databasePath: string): Db {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      payload TEXT NOT NULL CHECK (json_valid(payload)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS records_collection_idx
      ON records (collection);

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS solutions (
      fen TEXT NOT NULL,
      collection TEXT NOT NULL,
      tree TEXT NOT NULL CHECK (json_valid(tree)),
      PRIMARY KEY (collection, fen)
    );

    CREATE INDEX IF NOT EXISTS solutions_collection_idx
      ON solutions (collection);
  `);

  migrateSolutionsFenColumn(db);
}

function migrateSolutionsFenColumn(db: Db): void {
  const columns = db.prepare("PRAGMA table_info(solutions)").all() as { readonly name: string }[];
  const hasFen = columns.some(column => column.name === "fen");
  const hasId = columns.some(column => column.name === "id");

  if (hasFen || !hasId) return;

  db.exec(`
    ALTER TABLE solutions RENAME TO solutions_old;

    CREATE TABLE solutions (
      fen TEXT NOT NULL,
      collection TEXT NOT NULL,
      tree TEXT NOT NULL CHECK (json_valid(tree)),
      PRIMARY KEY (collection, fen)
    );

    INSERT INTO solutions (fen, collection, tree)
    SELECT id, collection, tree
    FROM solutions_old;

    DROP TABLE solutions_old;

    CREATE INDEX IF NOT EXISTS solutions_collection_idx
      ON solutions (collection);
  `);
}
