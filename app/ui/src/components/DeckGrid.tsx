import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Deck } from "../decks";
import { fetchReviewQueue, reviewDate, type ReviewQueue } from "../reviewClient";
import { FenPreview } from "./FenPreview";

type DeckGridProps = {
  decks: Deck[];
  onSelectDeck: (deck: Deck) => void;
};

type DeckPositionGridProps = {
  deck: Deck;
  onSelectPosition: (index: number) => void;
  onGoToDecks: () => void;
};

type DeckCardStyle = CSSProperties & {
  "--deck-accent": string;
};

export function DeckGrid({ decks, onSelectDeck }: DeckGridProps) {
  return (
    <main className="deck-page">
      <header className="deck-page-header">
        <h1>Decks</h1>
        <p>{decks.length} deck{decks.length === 1 ? "" : "s"} available</p>
      </header>

      <section className="deck-grid" aria-label="Decks">
        {decks.map(deck => (
          <button
            className="deck-card"
            type="button"
            key={deck.slug}
            style={{ "--deck-accent": deck.accentColor } as DeckCardStyle}
            onClick={() => onSelectDeck(deck)}
          >
            <div className="deck-card-preview">
              <FenPreview fen={deck.previewFen} />
            </div>
            <span className="deck-card-name">{deck.name}</span>
            <span className="deck-card-description">{deck.description}</span>
          </button>
        ))}
      </section>
    </main>
  );
}

export function DeckPositionGrid({ deck, onSelectPosition, onGoToDecks }: DeckPositionGridProps) {
  const [queue, setQueue] = useState<ReviewQueue>();
  const [queueError, setQueueError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setQueueError(false);
    fetchReviewQueue(deck.slug).then(value => {
      if (current) setQueue(value);
    }).catch(() => {
      if (current) setQueueError(true);
    });
    return () => { current = false; };
  }, [deck.slug, reload]);

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
  const recommendedIndex = queue?.recommendedFen ? deck.fens.indexOf(queue.recommendedFen) : -1;
  const dueCount = queue?.cards.filter(card => card.status === "due").length ?? 0;
  const newCount = queue?.cards.filter(card => card.status === "new").length ?? 0;

  return (
    <main className="deck-page">
      <header className="deck-page-header">
        <div>
          <h1>{deck.name}</h1>
          <p>{deck.fens.length} position{deck.fens.length === 1 ? "" : "s"} available</p>
        </div>
        <button className="deck-back-button" type="button" onClick={onGoToDecks}>
          Go to decks
        </button>
      </header>

      <section className="review-queue" aria-label="Practice schedule">
        <div>
          <h2>Practice</h2>
          {queue && !queueError ? (
            <p>
              {recommendedIndex >= 0
                ? `${dueCount} due · ${newCount} new. Recommended: Position ${recommendedIndex + 1}.`
                : `All caught up.${queue.nextDueAt ? ` Next review: ${reviewDate(queue.nextDueAt)}.` : ""}`}
            </p>
          ) : <p role="status">{queueError ? "Could not load your review schedule." : "Loading review schedule…"}</p>}
        </div>
        {queueError ? (
          <button className="deck-back-button" type="button" onClick={() => setReload(value => value + 1)}>Retry schedule</button>
        ) : recommendedIndex >= 0 ? (
          <button className="solution-submit-button" type="button" onClick={() => onSelectPosition(recommendedIndex)}>Practice recommended</button>
        ) : null}
      </section>

      <section className="deck-grid position-grid" aria-label={`${deck.name} positions`}>
        {deck.fens.map((fen, index) => {
          const card = queueError ? undefined : cards.get(fen);
          const recommended = !queueError && index === recommendedIndex;
          return (
          <button
            className={`deck-card position-card${recommended ? " is-recommended" : ""}`}
            type="button"
            key={`${deck.slug}-${index}`}
            style={{ "--deck-accent": deck.accentColor } as DeckCardStyle}
            aria-label={`Position ${index + 1}`}
            onClick={() => onSelectPosition(index)}
          >
            <div className="deck-card-preview position-card-preview">
              <FenPreview fen={fen} />
            </div>
            <span className="position-card-label">Position {index + 1}</span>
            {card ? (
              <span className={`position-card-status is-${card.status}`}>
                {recommended ? "Recommended · " : ""}
                {card.status === "due" ? "Due now" : card.status === "new" ? "New" : card.dueAt ? `Review ${reviewDate(card.dueAt)}` : "Scheduled"}
              </span>
            ) : null}
          </button>
          );
        })}
      </section>
    </main>
  );
}
