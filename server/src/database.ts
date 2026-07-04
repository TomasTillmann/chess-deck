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

    CREATE TABLE IF NOT EXISTS solutions (
      id TEXT NOT NULL,
      collection TEXT NOT NULL,
      tree TEXT NOT NULL CHECK (json_valid(tree)),
      PRIMARY KEY (collection, id)
    );

    CREATE INDEX IF NOT EXISTS solutions_collection_idx
      ON solutions (collection);
  `);
}
