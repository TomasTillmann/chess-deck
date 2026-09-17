import { learnerId } from "./learnerIdentity";

export type DeckView = {
  id: string;
  name: string;
  collections: string[];
  createdAt: string;
  updatedAt: string;
};

const serverBaseUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001";

async function request(id = "", method = "GET", body?: { collections: readonly string[] } | { name: string }) {
  const url = new URL(`/v1/deck-views${id ? `/${encodeURIComponent(id)}` : ""}`, serverBaseUrl);
  const learner = learnerId();
  if (!body) url.searchParams.set("learnerId", learner);
  const response = await fetch(url, {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ learnerId: learner, ...body }) } : {}),
  });
  if (!response.ok) throw new Error(`Deck view request failed: HTTP ${response.status}`);
  return response;
}

export async function fetchDeckViews(): Promise<DeckView[]> {
  const result = await (await request()).json() as { views: DeckView[] };
  return result.views;
}

export async function fetchDeckView(id: string): Promise<DeckView> {
  return (await request(id)).json() as Promise<DeckView>;
}

export async function createDeckView(collections: readonly string[]): Promise<DeckView> {
  return (await request("", "POST", { collections })).json() as Promise<DeckView>;
}

export async function renameDeckView(id: string, name: string): Promise<DeckView> {
  return (await request(id, "PATCH", { name })).json() as Promise<DeckView>;
}

export async function deleteDeckView(id: string): Promise<void> {
  await request(id, "DELETE");
}
