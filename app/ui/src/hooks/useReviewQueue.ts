import { useEffect, useMemo, useState } from "react";
import { fetchDecks, type Deck } from "../decks";
import { fetchReviewQueue, type ReviewQueue } from "../reviewClient";
import { loadDeckReview } from "../reviewCatalog";

export function useReviewQueue(deck: Deck, onDecksChange: (decks: Deck[]) => void) {
  const [queue, setQueue] = useState<ReviewQueue>();
  const [queueError, setQueueError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    const hash = window.location.hash;
    setQueueError(false);
    loadDeckReview(deck.slug, fetchDecks, fetchReviewQueue).then(value => {
      if (!current || hash !== window.location.hash) return;
      onDecksChange(value.decks);
      setQueue(value.queue);
    }).catch(() => {
      if (current) setQueueError(true);
    });
    return () => { current = false; };
  }, [deck.slug, reload, onDecksChange]);

  useEffect(() => {
    const refresh = () => setReload(value => value + 1);
    window.addEventListener("focus", refresh);
    const untilDue = queue?.nextDueAt ? Date.parse(queue.nextDueAt) - Date.parse(queue.serverNow) : undefined;
    const timer = untilDue !== undefined
      ? window.setTimeout(refresh, Math.min(2_147_483_647, Math.max(1000, untilDue + 250)))
      : undefined;
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearTimeout(timer);
    };
  }, [queue]);

  const cards = useMemo(() => new Map(queue?.cards.map(card => [card.fen, card])), [queue]);
  return {
    queue, queueError, cards,
    retry: () => setReload(value => value + 1),
    recommendedIndex: queue?.recommendedFen ? deck.fens.indexOf(queue.recommendedFen) : -1,
    dueCount: queue?.cards.filter(card => card.status === "due").length ?? 0,
    newCount: queue?.cards.filter(card => card.status === "new").length ?? 0,
  };
}
