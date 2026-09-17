import type { Deck } from "./decks";

type Route =
  | { view: "decks" }
  | { view: "practice" }
  | { view: "deck"; slug: string }
  | { view: "position"; slug: string; positionIndex: number };

export function routeFromHash(): Route {
  if (window.location.hash === "#/practice") return { view: "practice" };
  const positionMatch = window.location.hash.match(/^#\/decks\/([^/]+)\/positions\/(\d+)$/);

  if (positionMatch) {
    return {
      view: "position",
      slug: decodeURIComponent(positionMatch[1]),
      positionIndex: Number(positionMatch[2]) - 1,
    };
  }

  const deckMatch = window.location.hash.match(/^#\/decks\/([^/]+)$/);
  if (deckMatch) return { view: "deck", slug: decodeURIComponent(deckMatch[1]) };

  return { view: "decks" };
}

export function navigateToPractice() {
  window.location.hash = "/practice";
}

export function navigateToDeck(deck: Deck) {
  window.location.hash = `/decks/${encodeURIComponent(deck.slug)}`;
}

export function navigateToPosition(deck: Deck, positionIndex: number, preserveScroll = false) {
  const hash = `#/decks/${encodeURIComponent(deck.slug)}/positions/${positionIndex + 1}`;
  if (preserveScroll) {
    window.history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else window.location.hash = hash;
}

export function navigateToDecks() {
  window.location.hash = "/";
}
