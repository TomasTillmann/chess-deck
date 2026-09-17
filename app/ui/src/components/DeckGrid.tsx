import type { Deck } from "../decks";
import { PageHeader, type ThemeProps } from "../design-system";
import { DeckCard } from "./DeckCard";

export function DeckGrid({ decks, onSelectDeck, theme }: ThemeProps & { decks: Deck[]; onSelectDeck: (deck: Deck) => void }) {
  return <main className="deck-page" data-theme={theme}>
    <PageHeader title="Decks">{decks.length} deck{decks.length === 1 ? "" : "s"} available</PageHeader>
    <section className="deck-grid library-grid" aria-label="Decks">
      {decks.map(deck => <DeckCard key={deck.slug} fen={deck.previewFen} label={deck.name} onClick={() => onSelectDeck(deck)}>
        <span className="deck-card-description">{deck.description}</span>
      </DeckCard>)}
    </section>
  </main>;
}
