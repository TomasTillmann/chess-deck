import type { Db } from "./database.js";
import { collectionName } from "./repository.js";
import type { ReviewRating } from "./reviewScheduler.js";

type CardStatistics = {
  collection: string;
  fen: string;
  positionIndex: number;
  reviews: number;
  lastReviewedAt: string | null;
  dueAt: string | null;
  intervalDays: number | null;
  lapses: number;
  status: "new" | "due" | "scheduled";
};

type DeckStatistics = {
  collection: string;
  name: string;
  reviews: number;
  reviewedCards: number;
  totalCards: number;
  dueCards: number;
  lastReviewedAt: string | null;
};

const dayMilliseconds = 86_400_000;

function calendarDate(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * dayMilliseconds).toISOString().slice(0, 10);
}

export class StatisticsRepository {
  constructor(private readonly db: Db) {}

  get(learnerId: string, collection?: string, days = 30, timeZone = "UTC", now = Date.now()) {
    const serverNow = new Date(now).toISOString();
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const localDate = (date: string) => {
      const parts = dateFormatter.formatToParts(new Date(date));
      return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
    };
    const today = localDate(serverNow);
    const startDate = calendarDate(today, 1 - days);
    const activity = Array.from({ length: days }, (_, index) => ({
      date: calendarDate(startDate, index), count: 0,
    }));
    const forecast = Array.from({ length: 14 }, (_, index) => ({
      date: calendarDate(today, index), count: 0,
    }));
    const activityByDate = new Map(activity.map(day => [day.date, day]));
    const forecastByDate = new Map(forecast.map(day => [day.date, day]));

    // All queries run synchronously; each request supplies its own calendar formatter.
    this.db.function("statistics_day", { deterministic: true }, value => localDate(String(value)));
    const currentCards = `
      WITH positions AS (
        SELECT collection, fen, id,
          ROW_NUMBER() OVER (PARTITION BY collection ORDER BY id) - 1 AS positionIndex
        FROM collections ${collection === undefined ? "" : "WHERE collection = @collection"}
      ), current_cards AS (
        SELECT collection, fen, MIN(id) AS firstId, MIN(positionIndex) AS positionIndex
        FROM positions GROUP BY collection, fen
      )
    `;
    const scope = collection === undefined ? {} : { collection };
    const cards = this.db.prepare(`
      ${currentCards}, event_totals AS (
        SELECT collection, fen, COUNT(*) AS reviews, MAX(reviewed_at) AS lastReviewedAt
        FROM review_events WHERE learner_id = @learnerId AND reviewed_at <= @serverNow
        ${collection === undefined ? "" : "AND collection = @collection"}
        GROUP BY collection, fen
      )
      SELECT c.collection, c.fen, c.positionIndex, COALESCE(e.reviews, 0) AS reviews,
        e.lastReviewedAt, r.due_at AS dueAt, r.interval_days AS intervalDays,
        COALESCE(r.lapses, 0) AS lapses,
        CASE WHEN r.fen IS NULL THEN 'new'
          WHEN r.due_at <= @serverNow THEN 'due' ELSE 'scheduled' END AS status
      FROM current_cards c
      LEFT JOIN review_cards r
        ON r.learner_id = @learnerId AND r.collection = c.collection AND r.fen = c.fen
      LEFT JOIN event_totals e ON e.collection = c.collection AND e.fen = c.fen
      ORDER BY c.firstId
    `).all({ learnerId, serverNow, ...scope }) as CardStatistics[];

    const periodCounts = this.db.prepare(`
      ${currentCards}
      SELECT e.collection, e.fen, e.rating, statistics_day(e.reviewed_at) AS date, COUNT(*) AS count
      FROM review_events e
      JOIN current_cards c ON c.collection = e.collection AND c.fen = e.fen
      WHERE e.learner_id = @learnerId AND e.reviewed_at >= @earliestPossibleInstant
        AND e.reviewed_at <= @serverNow
      GROUP BY e.collection, e.fen, e.rating, date
      HAVING date >= @startDate
    `).all({
      learnerId, serverNow, startDate, ...scope,
      // One extra UTC day covers every IANA offset; the local-date condition is exact.
      earliestPossibleInstant: new Date(Date.parse(`${startDate}T00:00:00Z`) - dayMilliseconds).toISOString(),
    }) as { collection: string; fen: string; rating: ReviewRating; date: string; count: number }[];

    const ratings = { easy: 0, hard: 0, again: 0 };
    const reviewedCards = new Set<string>();
    for (const row of periodCounts) {
      ratings[row.rating] += row.count;
      reviewedCards.add(JSON.stringify([row.collection, row.fen]));
      activityByDate.get(row.date)!.count += row.count;
    }

    const decksByCollection = new Map<string, DeckStatistics>();
    let dueCards = 0;
    let newCards = 0;
    for (const card of cards) {
      let deck = decksByCollection.get(card.collection);
      if (!deck) {
        deck = {
          collection: card.collection, name: collectionName(card.collection), reviews: 0,
          reviewedCards: 0, totalCards: 0, dueCards: 0, lastReviewedAt: null,
        };
        decksByCollection.set(card.collection, deck);
      }
      deck.totalCards += 1;
      deck.reviews += card.reviews;
      if (card.reviews > 0) deck.reviewedCards += 1;
      if (card.lastReviewedAt && (!deck.lastReviewedAt || card.lastReviewedAt > deck.lastReviewedAt)) {
        deck.lastReviewedAt = card.lastReviewedAt;
      }
      if (card.status === "due") {
        dueCards += 1;
        deck.dueCards += 1;
      } else if (card.status === "new") {
        newCards += 1;
      } else if (card.dueAt) {
        const day = forecastByDate.get(localDate(card.dueAt));
        if (day) day.count += 1;
      }
    }

    return {
      serverNow, timeZone, days,
      summary: {
        reviews: ratings.easy + ratings.hard + ratings.again,
        reviewedCards: reviewedCards.size,
        totalCards: cards.length,
        practiceDays: activity.filter(day => day.count > 0).length,
        dueCards, newCards, scheduledCards: cards.length - dueCards - newCards,
      },
      ratings, activity, forecast, decks: [...decksByCollection.values()], cards,
    };
  }
}
