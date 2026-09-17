import type { Deck } from "./decks";
import type { ReviewQueue } from "./reviewClient";

export async function loadDeckReview(
  collection: string,
  loadDecks: () => Promise<Deck[]>,
  loadQueue: (collection: string) => Promise<ReviewQueue>,
) {
  const [decks, queue] = await Promise.all([loadDecks(), loadQueue(collection)]);
  const deck = decks.find(value => value.slug === collection);
  if (!deck) throw new Error("Deck is unavailable");
  const recommendedIndex = queue.recommendedFen ? deck.fens.indexOf(queue.recommendedFen) : -1;
  if (queue.recommendedFen && recommendedIndex < 0) throw new Error("Recommended position is unavailable");
  return { decks, deck, queue, recommendedIndex };
}
