export type ReviewRating = "easy" | "hard" | "again";

export type ReviewSchedule = {
  readonly dueAt: string;
  readonly intervalDays: number;
  readonly easeFactor: number;
  readonly repetitions: number;
  readonly lapses: number;
};

export type ScheduledReview = ReviewSchedule & { readonly scheduleUnchanged: boolean };

const DAY_MS = 86_400_000;
const MAX_INTERVAL_DAYS = 3_650;

/** Anki-inspired scheduling; timestamps are supplied by the server, never the client. */
export function scheduleReview(
  previous: ReviewSchedule | null,
  rating: ReviewRating,
  now: number,
): ScheduledReview {
  // Manual practice before a card is due cannot inflate its interval.
  if (previous && Date.parse(previous.dueAt) > now && rating !== "again") {
    return { ...previous, scheduleUnchanged: true };
  }

  const interval = previous?.intervalDays ?? 0;
  const ease = previous?.easeFactor ?? 2.5;
  const intervalDays = rating === "again"
    ? 10 / 1_440
    : Math.min(MAX_INTERVAL_DAYS, rating === "hard"
      ? Math.max(1, Math.ceil(interval * 1.2))
      : interval < 1 ? 4 : Math.ceil(interval * ease * 1.3));
  const easeChange = rating === "easy" ? 0.15 : rating === "hard" ? -0.15 : -0.2;

  return {
    dueAt: new Date(now + intervalDays * DAY_MS).toISOString(),
    intervalDays,
    easeFactor: Math.round(Math.max(1.3, Math.min(3, ease + easeChange)) * 100) / 100,
    repetitions: rating === "again" ? 0 : (previous?.repetitions ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (rating === "again" ? 1 : 0),
    scheduleUnchanged: false,
  };
}
