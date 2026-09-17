import type { Deck } from "../decks";
import { Button, Icon, PageHeader, type ThemeProps } from "../design-system";
import { useReviewQueue } from "../hooks/useReviewQueue";
import { reviewDate } from "../reviewClient";
import { DeckCard } from "./DeckCard";

export function DeckPositionGrid({ deck, onSelectPosition, onGoToDecks, onDecksChange, theme }: ThemeProps & {
  deck: Deck;
  onSelectPosition: (index: number) => void;
  onGoToDecks: () => void;
  onDecksChange: (decks: Deck[]) => void;
}) {
  const { queue, queueError, cards, retry, recommendedIndex, dueCount, newCount } = useReviewQueue(deck, onDecksChange);
  return <main className="deck-page" data-theme={theme}>
    <PageHeader title={deck.name} actions={<Button className="deck-back-button" onClick={onGoToDecks}><Icon name="arrow-left" />Go to decks</Button>}>
      {deck.fens.length} position{deck.fens.length === 1 ? "" : "s"} available
    </PageHeader>
    <section className="review-queue" aria-label="Practice schedule">
      <div>
        <h2>Practice</h2>
        {queue && !queueError ? <p>{recommendedIndex >= 0
          ? `${dueCount} due · ${newCount} new. Recommended: Position ${recommendedIndex + 1}.`
          : `All caught up.${queue.nextDueAt ? ` Next review: ${reviewDate(queue.nextDueAt)}.` : ""}`}</p>
          : <p role="status">{queueError ? "Could not load your review schedule." : "Loading review schedule…"}</p>}
      </div>
      {queueError ? <Button className="deck-back-button" onClick={retry}>Retry schedule</Button>
        : recommendedIndex >= 0 ? <Button variant="primary" className="solution-submit-button" onClick={() => onSelectPosition(recommendedIndex)}>Practice recommended</Button> : null}
    </section>
    <section className="deck-grid position-grid" aria-label={`${deck.name} positions`}>
      {deck.fens.map((fen, index) => {
        const card = queueError ? undefined : cards.get(fen);
        const recommended = !queueError && index === recommendedIndex;
        return <DeckCard key={`${deck.slug}-${index}`} fen={fen} label={`Position ${index + 1}`} position recommended={recommended} onClick={() => onSelectPosition(index)}>
          {card ? <span className={`position-card-status is-${card.status}`}>
            {recommended ? "Recommended · " : ""}
            {card.status === "due" ? "Due now" : card.status === "new" ? "New" : card.dueAt ? `Review ${reviewDate(card.dueAt)}` : "Scheduled"}
          </span> : null}
        </DeckCard>;
      })}
    </section>
  </main>;
}
