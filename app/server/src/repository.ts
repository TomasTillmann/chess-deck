import type { Db } from "./database.js";

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

type CollectionRow = {
  id: number;
  collection: string;
  fen: string;
};

export function collectionName(slug: string): string {
  const names: Record<string, string> = {
    woodpecker: "Woodpecker",
    encyclopedia: "Encyclopedia of Chess Combinations",
  };
  return Object.hasOwn(names, slug) ? names[slug]
    : slug.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export class CollectionRepository {
  constructor(private readonly db: Db) {}

  listSlugs(): string[] {
    const rows = this.db.prepare(`
      SELECT collection FROM collections GROUP BY collection ORDER BY MIN(id)
    `).all() as { collection: string }[];
    return rows.map(row => row.collection);
  }

  listFens(collection = "woodpecker"): string[] {
    const rows = this.db
      .prepare("SELECT id, collection, fen FROM collections WHERE collection = ? ORDER BY id")
      .all(collection) as CollectionRow[];

    return rows.map(row => row.fen);
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

  upsertMany(collection: string, solutions: readonly SolutionInput[], overwrite = true): number {
    if (solutions.length === 0) return 0;

    const statement = this.db.prepare(
      `
        INSERT INTO solutions (fen, collection, tree)
        VALUES (@fen, @collection, @tree)
        ON CONFLICT(collection, fen) DO ${overwrite ? "UPDATE SET tree = excluded.tree" : "NOTHING"}
      `,
    );

    const insertMany = this.db.transaction((items: readonly SolutionInput[]) => {
      let stored = 0;
      for (const solution of items) {
        stored += statement.run({
          fen: solution.fen,
          collection,
          tree: JSON.stringify(solution.tree),
        }).changes;
      }
      return stored;
    });

    return insertMany(solutions);
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

function mapSolutionRow(row: SolutionRow): StoredSolution {
  return {
    fen: row.fen,
    collection: row.collection,
    tree: JSON.parse(row.tree) as unknown,
  };
}
