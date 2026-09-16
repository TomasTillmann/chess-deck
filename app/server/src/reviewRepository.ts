import crypto from "node:crypto";
import type { Db } from "./database.js";
import { scheduleReview, type ReviewRating, type ReviewSchedule } from "./reviewScheduler.js";

export type ReviewInput = {
  readonly learnerId: string;
  readonly reviewId: string;
  readonly collection: string;
  readonly fen: string;
  readonly rating: ReviewRating;
};

export type ReviewResult = {
  readonly reviewId: string;
  readonly rating: ReviewRating;
  readonly dueAt: string;
  readonly intervalDays: number;
  readonly repetitions: number;
  readonly lapses: number;
  readonly scheduleUnchanged: boolean;
};

type QueueCard = {
  readonly fen: string;
  readonly status: "due" | "new" | "scheduled";
  readonly dueAt: string | null;
};

export class ReviewPositionNotFoundError extends Error {
  constructor() { super("Position not found in this collection"); }
}

export class ReviewConflictError extends Error {
  constructor() { super("This review ID was already used for a different rating or position"); }
}

export class ReviewRepository {
  constructor(private readonly db: Db) {}

  queue(learnerId: string, collection: string, now = Date.now()) {
    const serverNow = new Date(now).toISOString();
    const cards = this.db.prepare(`
      SELECT c.fen, r.due_at AS dueAt,
        CASE WHEN r.fen IS NULL THEN 'new'
          WHEN r.due_at <= @serverNow THEN 'due' ELSE 'scheduled' END AS status
      FROM collections c
      LEFT JOIN review_cards r
        ON r.learner_id = @learnerId AND r.collection = c.collection AND r.fen = c.fen
      WHERE c.collection = @collection
      GROUP BY c.fen
      ORDER BY CASE status WHEN 'due' THEN 0 WHEN 'new' THEN 1 ELSE 2 END,
        r.due_at, MIN(c.id)
    `).all({ learnerId, collection, serverNow }) as QueueCard[];

    const dueCards = cards.filter(card => card.status === "due");
    const candidates = dueCards.length > 0 ? dueCards : cards.filter(card => card.status === "new");

    return {
      serverNow,
      cards,
      recommendedFen: candidates.length > 0 ? candidates[crypto.randomInt(candidates.length)].fen : null,
      nextDueAt: cards.find(card => card.status === "scheduled")?.dueAt ?? null,
    };
  }

  options(learnerId: string, collection: string, fen: string, now = Date.now()) {
    this.requirePosition(collection, fen);
    const previous = this.find(learnerId, collection, fen);
    const option = (rating: ReviewRating) => {
      const { dueAt, intervalDays, scheduleUnchanged } = scheduleReview(previous, rating, now);
      return { dueAt, intervalDays, scheduleUnchanged };
    };
    return {
      serverNow: new Date(now).toISOString(),
      dueAt: previous?.dueAt ?? null,
      options: { easy: option("easy"), hard: option("hard"), again: option("again") },
    };
  }

  save(input: ReviewInput, now = Date.now()): ReviewResult {
    return this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT collection, fen, rating, result FROM review_events
        WHERE learner_id = ? AND review_id = ?
      `).get(input.learnerId, input.reviewId) as
        | { collection: string; fen: string; rating: ReviewRating; result: string }
        | undefined;
      if (existing) {
        if (existing.collection !== input.collection || existing.fen !== input.fen || existing.rating !== input.rating) {
          throw new ReviewConflictError();
        }
        return JSON.parse(existing.result) as ReviewResult;
      }

      this.requirePosition(input.collection, input.fen);
      const schedule = scheduleReview(this.find(input.learnerId, input.collection, input.fen), input.rating, now);
      const result: ReviewResult = {
        reviewId: input.reviewId,
        rating: input.rating,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        repetitions: schedule.repetitions,
        lapses: schedule.lapses,
        scheduleUnchanged: schedule.scheduleUnchanged,
      };
      this.db.prepare(`
        INSERT INTO review_cards (learner_id, collection, fen, due_at, interval_days, ease_factor, repetitions, lapses)
        VALUES (@learnerId, @collection, @fen, @dueAt, @intervalDays, @easeFactor, @repetitions, @lapses)
        ON CONFLICT (learner_id, collection, fen) DO UPDATE SET
          due_at = excluded.due_at, interval_days = excluded.interval_days,
          ease_factor = excluded.ease_factor, repetitions = excluded.repetitions, lapses = excluded.lapses
      `).run({ ...input, ...schedule });
      this.db.prepare(`
        INSERT INTO review_events (learner_id, review_id, collection, fen, rating, reviewed_at, result)
        VALUES (@learnerId, @reviewId, @collection, @fen, @rating, @reviewedAt, @result)
      `).run({ ...input, reviewedAt: new Date(now).toISOString(), result: JSON.stringify(result) });
      return result;
    }).immediate();
  }

  private find(learnerId: string, collection: string, fen: string): ReviewSchedule | null {
    return this.db.prepare(`
      SELECT due_at AS dueAt, interval_days AS intervalDays, ease_factor AS easeFactor, repetitions, lapses
      FROM review_cards WHERE learner_id = ? AND collection = ? AND fen = ?
    `).get(learnerId, collection, fen) as ReviewSchedule | undefined ?? null;
  }

  private requirePosition(collection: string, fen: string): void {
    const position = this.db.prepare("SELECT 1 FROM collections WHERE collection = ? AND fen = ? LIMIT 1")
      .get(collection, fen);
    if (!position) throw new ReviewPositionNotFoundError();
  }
}
