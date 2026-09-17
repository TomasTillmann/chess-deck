import { learnerId } from "./learnerIdentity";

export type StatisticsPeriod = 30 | 90 | 365;
export type DailyCount = { date: string; count: number };
export type CardStatistics = {
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
export type Statistics = {
  serverNow: string;
  timeZone: string;
  days: number;
  summary: {
    reviews: number;
    reviewedCards: number;
    totalCards: number;
    practiceDays: number;
    dueCards: number;
    newCards: number;
    scheduledCards: number;
  };
  ratings: { easy: number; hard: number; again: number };
  activity: DailyCount[];
  forecast: DailyCount[];
  decks: {
    collection: string;
    name: string;
    reviews: number;
    reviewedCards: number;
    totalCards: number;
    dueCards: number;
    lastReviewedAt: string | null;
  }[];
  cards: CardStatistics[];
};

export async function fetchStatistics(collection: string, days: StatisticsPeriod, signal?: AbortSignal): Promise<Statistics> {
  const url = new URL("/v1/statistics", import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001");
  url.searchParams.set("learnerId", learnerId());
  if (collection) url.searchParams.set("collection", collection);
  url.searchParams.set("days", String(days));
  url.searchParams.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load statistics: HTTP ${response.status}`);
  return response.json() as Promise<Statistics>;
}

export function chartPoints(days: DailyCount[], groupByWeek = false) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const label = (date: string) => formatter.format(new Date(`${date}T12:00:00Z`));
  if (!groupByWeek) return days.map(day => ({ label: label(day.date), value: day.count }));
  const points = [];
  for (let index = 0; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    points.push({
      label: `${label(week[0].date)} – ${label(week[week.length - 1].date)}`,
      shortLabel: label(week[0].date),
      value: week.reduce((total, day) => total + day.count, 0),
    });
  }
  return points;
}
