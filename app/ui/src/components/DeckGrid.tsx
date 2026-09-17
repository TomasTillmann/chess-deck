import type { Deck } from "../decks";
import { Button, PageHeader, type ThemeProps } from "../design-system";
import { navigateToPractice } from "../routing";
import { DeckCard } from "./DeckCard";

export function DeckGrid({ decks, onSelectDeck, theme }: ThemeProps & { decks: Deck[]; onSelectDeck: (deck: Deck) => void }) {
  return <main className="deck-page" data-theme={theme}>
    <div className="library-practice"><Button variant="primary" onClick={navigateToPractice}>Practice All</Button></div>
    <PageHeader title="Decks">{decks.length} deck{decks.length === 1 ? "" : "s"} available</PageHeader>
    <section className="deck-grid library-grid" aria-label="Decks">
      {decks.map(deck => <DeckCard key={deck.slug} fen={deck.previewFen} label={deck.name} onClick={() => onSelectDeck(deck)}>
        <span className="deck-card-description">{deck.description}</span>
      </DeckCard>)}
    </section>
  </main>;
}
