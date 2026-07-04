import type { CSSProperties } from "react";
import type { Deck } from "../decks";
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

      <section className="deck-grid position-grid" aria-label={`${deck.name} positions`}>
        {deck.fens.map((fen, index) => (
          <button
            className="deck-card position-card"
            type="button"
            key={`${deck.slug}-${index}`}
            style={{ "--deck-accent": deck.accentColor } as DeckCardStyle}
            aria-label={`Position ${index + 1}`}
            onClick={() => onSelectPosition(index)}
          >
            <div className="deck-card-preview position-card-preview">
              <FenPreview fen={fen} />
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
