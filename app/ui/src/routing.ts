import type { Deck } from "./decks";

export function navigationScroll(event: Event, saved: unknown): { top: number; left: number } | undefined {
  if ((event as CustomEvent<{ preserveScroll?: boolean }>).detail?.preserveScroll) return undefined;
  const point = saved as { top?: unknown; left?: unknown } | null;
  return point && typeof point.top === "number" && Number.isFinite(point.top) && point.top >= 0
    && typeof point.left === "number" && Number.isFinite(point.left) && point.left >= 0
    ? { top: point.top, left: point.left } : { top: 0, left: 0 };
}

type Route =
  | { view: "decks" }
  | { view: "views" }
  | { view: "statistics" }
  | { view: "practice"; viewId?: string }
  | { view: "deck"; slug: string }
  | { view: "position"; slug: string; positionIndex: number };

export function routeFromHash(): Route {
  if (window.location.hash === "#/statistics") return { view: "statistics" };
  if (window.location.hash === "#/views") return { view: "views" };
  if (window.location.hash === "#/practice") return { view: "practice" };
  const viewMatch = window.location.hash.match(/^#\/views\/([0-9a-f-]+)\/practice$/i);
  if (viewMatch) return { view: "practice", viewId: viewMatch[1] };
  const deckMatch = window.location.hash.match(/^#\/decks\/([^/]+)(?:\/positions\/(\d+))?$/);
  if (deckMatch) {
    let slug: string;
    try {
      slug = decodeURIComponent(deckMatch[1]);
    } catch {
      return { view: "decks" };
    }
    return deckMatch[2]
      ? { view: "position", slug, positionIndex: Number(deckMatch[2]) - 1 }
      : { view: "deck", slug };
  }

  return { view: "decks" };
}

export function navigateToPractice() {
  window.location.hash = "/practice";
}

export function navigateToDeckView(id: string) {
  window.location.hash = `/views/${encodeURIComponent(id)}/practice`;
}

export function navigateToDeckViews() {
  window.location.hash = "/views";
}

export function navigateToDeck(deck: Deck) {
  window.location.hash = `/decks/${encodeURIComponent(deck.slug)}`;
}

export function navigateToPosition(deck: Deck, positionIndex: number, preserveScroll = false) {
  const hash = `#/decks/${encodeURIComponent(deck.slug)}/positions/${positionIndex + 1}`;
  if (preserveScroll) {
    window.history.pushState(null, "", hash);
    window.dispatchEvent(new CustomEvent("hashchange", { detail: { preserveScroll: true } }));
  } else window.location.hash = hash;
}

export function navigateToDecks() {
  window.location.hash = "/";
}
