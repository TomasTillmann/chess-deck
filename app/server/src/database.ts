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
      collection TEXT NOT NULL DEFAULT 'woodpecker',
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

    CREATE TABLE IF NOT EXISTS review_cards (
      learner_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      fen TEXT NOT NULL,
      due_at TEXT NOT NULL,
      interval_days REAL NOT NULL CHECK (interval_days > 0 AND interval_days <= 3650),
      ease_factor REAL NOT NULL CHECK (ease_factor >= 1.3 AND ease_factor <= 3),
      repetitions INTEGER NOT NULL CHECK (repetitions >= 0),
      lapses INTEGER NOT NULL CHECK (lapses >= 0),
      PRIMARY KEY (learner_id, collection, fen)
    );

    CREATE TABLE IF NOT EXISTS review_events (
      learner_id TEXT NOT NULL,
      review_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      fen TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('easy', 'hard', 'again')),
      reviewed_at TEXT NOT NULL,
      result TEXT NOT NULL CHECK (json_valid(result)),
      PRIMARY KEY (learner_id, review_id)
    );

    CREATE TABLE IF NOT EXISTS deck_views (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      collections TEXT NOT NULL CHECK (
        json_valid(collections) AND json_type(collections) = 'array' AND json_array_length(collections) > 0
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (learner_id, collections)
    );
  `);

  migrateSolutionsFenColumn(db);
  migrateCollectionsCollectionColumn(db);
}

function migrateCollectionsCollectionColumn(db: Db): void {
  const columns = db.prepare("PRAGMA table_info(collections)").all() as { readonly name: string }[];
  if (!columns.some(column => column.name === "collection")) {
    db.exec("ALTER TABLE collections ADD COLUMN collection TEXT NOT NULL DEFAULT 'woodpecker'");
  }
  db.exec("CREATE INDEX IF NOT EXISTS collections_collection_idx ON collections (collection)");
}

function migrateSolutionsFenColumn(db: Db): void {
  const columns = db.prepare("PRAGMA table_info(solutions)").all() as { readonly name: string }[];
  const hasFen = columns.some(column => column.name === "fen");
  const hasId = columns.some(column => column.name === "id");

  if (hasFen || !hasId) return;

  db.transaction(() => db.exec(`
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
  `))();
}
