export type ReviewRating = "easy" | "hard" | "again";

export type ReviewOption = {
  dueAt: string;
  intervalDays: number;
  scheduleUnchanged: boolean;
};

export type ReviewResult = ReviewOption & {
  reviewId: string;
  rating: ReviewRating;
  repetitions: number;
  lapses: number;
};

export type ReviewCard = {
  fen: string;
  status: "due" | "new" | "scheduled";
  dueAt: string | null;
};

export type ReviewQueue = {
  serverNow: string;
  cards: ReviewCard[];
  recommendedFen: string | null;
  nextDueAt: string | null;
};

export type PracticeCard = { collection: string; fen: string };

export type PracticeQueue = Omit<ReviewQueue, "cards"> & {
  cards: (ReviewCard & PracticeCard)[];
  recommendedCard: PracticeCard | null;
};

const serverBaseUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001";
const learnerKey = "woodpecker.learnerId";

function learnerId(): string {
  // Only the anonymous identity lives here; reviews and scheduling live in SQLite.
  const stored = localStorage.getItem(learnerKey);
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(learnerKey, id);
  return id;
}

export async function fetchReviewQueue(collection: string): Promise<ReviewQueue> {
  const url = new URL("/v1/review-queue", serverBaseUrl);
  url.searchParams.set("learnerId", learnerId());
  url.searchParams.set("collection", collection);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Review request failed: HTTP ${response.status}`);
  return response.json() as Promise<ReviewQueue>;
}

export async function fetchPracticeQueue(collections?: readonly string[]): Promise<PracticeQueue> {
  if (collections?.length === 0) throw new Error("Select at least one deck");
  const url = new URL("/v1/practice-queue", serverBaseUrl);
  url.searchParams.set("learnerId", learnerId());
  collections?.forEach(collection => url.searchParams.append("collection", collection));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Practice request failed: HTTP ${response.status}`);
  return response.json() as Promise<PracticeQueue>;
}

export async function saveReview(collection: string, fen: string, reviewId: string, rating: ReviewRating): Promise<ReviewResult> {
  const response = await fetch(new URL("/v1/reviews", serverBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ learnerId: learnerId(), reviewId, collection, fen, rating }),
  });
  if (!response.ok) throw new Error(`Could not save review: HTTP ${response.status}`);
  return response.json() as Promise<ReviewResult>;
}

export function reviewDate(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
