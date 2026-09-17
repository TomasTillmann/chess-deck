import { randomUUID } from "node:crypto";
import type { Db } from "./database.js";
import { CollectionRepository, collectionName } from "./repository.js";

export type DeckView = {
  readonly id: string;
  readonly name: string;
  readonly collections: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

type DeckViewRow = Omit<DeckView, "collections"> & { readonly collections: string };
const fields = "id, name, collections, created_at AS createdAt, updated_at AS updatedAt";
const mapView = (row: DeckViewRow): DeckView => ({ ...row, collections: JSON.parse(row.collections) as string[] });

export class DeckViewCollectionsError extends Error {
  constructor() { super("Select at least one existing deck"); }
}

export class DeckViewRepository {
  constructor(private readonly db: Db) {}

  list(learnerId: string): DeckView[] {
    const rows = this.db.prepare(`SELECT ${fields} FROM deck_views WHERE learner_id = ? ORDER BY created_at DESC, id`)
      .all(learnerId) as DeckViewRow[];
    return rows.map(mapView);
  }

  find(learnerId: string, id: string): DeckView | null {
    const row = this.db.prepare(`SELECT ${fields} FROM deck_views WHERE learner_id = ? AND id = ?`)
      .get(learnerId, id) as DeckViewRow | undefined;
    return row ? mapView(row) : null;
  }

  create(learnerId: string, collections: readonly string[]): DeckView {
    const selected = [...new Set(collections)].sort();
    const scope = JSON.stringify(selected);
    return this.db.transaction(() => {
      const existing = this.db.prepare(`SELECT ${fields} FROM deck_views WHERE learner_id = ? AND collections = ?`)
        .get(learnerId, scope) as DeckViewRow | undefined;
      if (existing) return mapView(existing);

      const available = new Set(new CollectionRepository(this.db).listSlugs());
      if (selected.length === 0 || selected.some(slug => !available.has(slug))) throw new DeckViewCollectionsError();
      const now = new Date().toISOString();
      const view: DeckView = {
        id: randomUUID(), name: selected.map(collectionName).join(" + "), collections: selected,
        createdAt: now, updatedAt: now,
      };
      this.db.prepare(`
        INSERT INTO deck_views (id, learner_id, name, collections, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(view.id, learnerId, view.name, scope, now, now);
      return view;
    }).immediate();
  }

  rename(learnerId: string, id: string, name: string): DeckView | null {
    const result = this.db.prepare("UPDATE deck_views SET name = ?, updated_at = ? WHERE learner_id = ? AND id = ?")
      .run(name, new Date().toISOString(), learnerId, id);
    return result.changes ? this.find(learnerId, id) : null;
  }

  delete(learnerId: string, id: string): boolean {
    return this.db.prepare("DELETE FROM deck_views WHERE learner_id = ? AND id = ?").run(learnerId, id).changes > 0;
  }
}
