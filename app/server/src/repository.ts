import crypto from "node:crypto";
import type { Db } from "./database.js";

export type StoredRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  readonly id: string;
  readonly collection: string;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RecordRow = {
  id: string;
  collection: string;
  payload: string;
  created_at: string;
  updated_at: string;
};

export type StoredSolution = {
  readonly fen: string;
  readonly collection: string;
  readonly tree: unknown;
};

export type SolutionInput = {
  readonly fen: string;
  readonly tree: unknown;
};

type SolutionRow = {
  fen: string;
  collection: string;
  tree: string;
};

export class RecordRepository {
  constructor(private readonly db: Db) {}

  create<TPayload extends Record<string, unknown>>(
    collection: string,
    payload: TPayload,
  ): StoredRecord<TPayload> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT INTO records (id, collection, payload, created_at, updated_at)
          VALUES (@id, @collection, @payload, @createdAt, @updatedAt)
        `,
      )
      .run({
        id,
        collection,
        payload: JSON.stringify(payload),
        createdAt: now,
        updatedAt: now,
      });

    return {
      id,
      collection,
      payload,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById<TPayload extends Record<string, unknown>>(
    collection: string,
    id: string,
  ): StoredRecord<TPayload> | null {
    const row = this.db
      .prepare("SELECT * FROM records WHERE collection = ? AND id = ?")
      .get(collection, id) as RecordRow | undefined;

    return row ? mapRow<TPayload>(row) : null;
  }

  list<TPayload extends Record<string, unknown>>(
    collection: string,
    limit = 100,
    offset = 0,
  ): StoredRecord<TPayload>[] {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM records
          WHERE collection = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?
        `,
      )
      .all(collection, limit, offset) as RecordRow[];

    return rows.map(mapRow<TPayload>);
  }

  update<TPayload extends Record<string, unknown>>(
    collection: string,
    id: string,
    payload: TPayload,
  ): StoredRecord<TPayload> | null {
    const updatedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `
          UPDATE records
          SET payload = @payload, updated_at = @updatedAt
          WHERE collection = @collection AND id = @id
        `,
      )
      .run({
        id,
        collection,
        payload: JSON.stringify(payload),
        updatedAt,
      });

    if (result.changes === 0) return null;
    return this.findById<TPayload>(collection, id);
  }

  delete(collection: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM records WHERE collection = ? AND id = ?")
      .run(collection, id);

    return result.changes > 0;
  }
}

export class SolutionRepository {
  constructor(private readonly db: Db) {}

  existingFens(collection: string, fens: readonly string[]): string[] {
    if (fens.length === 0) return [];

    const existing: string[] = [];
    for (let offset = 0; offset < fens.length; offset += 500) {
      const chunk = fens.slice(offset, offset + 500);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `
            SELECT fen
            FROM solutions
            WHERE collection = ? AND fen IN (${placeholders})
          `,
        )
        .all(collection, ...chunk) as { readonly fen: string }[];

      existing.push(...rows.map(row => row.fen));
    }

    return existing;
  }

  upsertMany(collection: string, solutions: readonly SolutionInput[]): number {
    if (solutions.length === 0) return 0;

    const statement = this.db.prepare(
      `
        INSERT INTO solutions (fen, collection, tree)
        VALUES (@fen, @collection, @tree)
        ON CONFLICT(collection, fen) DO UPDATE SET
          tree = excluded.tree
      `,
    );

    const insertMany = this.db.transaction((items: readonly SolutionInput[]) => {
      for (const solution of items) {
        statement.run({
          fen: solution.fen,
          collection,
          tree: JSON.stringify(solution.tree),
        });
      }
    });

    insertMany(solutions);
    return solutions.length;
  }

  upsert(collection: string, fen: string, tree: unknown): StoredSolution {
    this.upsertMany(collection, [{ fen, tree }]);

    const stored = this.findByFen(collection, fen);
    if (!stored) throw new Error(`Failed to store solution for ${collection}/${fen}`);

    return stored;
  }

  findByFen(collection: string, fen: string): StoredSolution | null {
    const row = this.db
      .prepare("SELECT * FROM solutions WHERE collection = ? AND fen = ?")
      .get(collection, fen) as SolutionRow | undefined;

    return row ? mapSolutionRow(row) : null;
  }

  count(collection: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM solutions WHERE collection = ?")
      .get(collection) as { readonly count: number };

    return row.count;
  }
}

function mapRow<TPayload extends Record<string, unknown>>(row: RecordRow): StoredRecord<TPayload> {
  return {
    id: row.id,
    collection: row.collection,
    payload: JSON.parse(row.payload) as TPayload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSolutionRow(row: SolutionRow): StoredSolution {
  return {
    fen: row.fen,
    collection: row.collection,
    tree: JSON.parse(row.tree) as unknown,
  };
}
