import type { StatisticsPeriod } from "./statisticsClient";

export type StatisticsViewState = {
  collection: string;
  days: StatisticsPeriod;
  filter: "all" | "reviewed" | "due" | "new";
  sort: "reviews" | "lapses" | "position";
  page: number;
};

export type CardStatisticsViewState = Pick<StatisticsViewState, "filter" | "sort" | "page">;

export function readStatisticsViewState(value: unknown): StatisticsViewState {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    collection: typeof saved.collection === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(saved.collection) ? saved.collection : "",
    days: saved.days === 90 || saved.days === 365 ? saved.days : 30,
    filter: saved.filter === "reviewed" || saved.filter === "due" || saved.filter === "new" ? saved.filter : "all",
    sort: saved.sort === "lapses" || saved.sort === "position" ? saved.sort : "reviews",
    page: typeof saved.page === "number" && Number.isSafeInteger(saved.page) && saved.page >= 0 ? saved.page : 0,
  };
}
