import { useRef, useState } from "react";
import type { Deck } from "../decks";
import { createDeckView } from "../deckViewClient";
import { Button, PageHeader, StatusMessage, type ThemeProps } from "../design-system";
import { navigateToDeckView, navigateToPractice } from "../routing";
import { DeckCard } from "./DeckCard";
import { DeckViews } from "./DeckViews";

export function DeckGrid({ decks, onSelectDeck, theme }: ThemeProps & { decks: Deck[]; onSelectDeck: (deck: Deck) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const selection = selected.filter(slug => decks.some(deck => deck.slug === slug));

  async function practiceSelected() {
    if (!selection.length || pending.current) return;
    pending.current = true;
    setStarting(true);
    setError(false);
    try {
      const view = await createDeckView(selection);
      navigateToDeckView(view.id);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setStarting(false);
    }
  }

  return <main className="deck-page" data-theme={theme}>
    <div className="library-practice"><Button variant="primary" onClick={navigateToPractice}>Practice All</Button></div>
    <PageHeader title="Decks" actions={<div className="deck-selection-actions">
      <span role="status">{selection.length} selected</span>
      <Button variant="primary" disabled={!selection.length || starting} onClick={() => void practiceSelected()}>{starting ? "Starting…" : "Practice"}</Button>
    </div>}>{decks.length} deck{decks.length === 1 ? "" : "s"} available</PageHeader>
    {error && <div className="deck-selection-error"><StatusMessage tone="danger" role="alert">Could not start practice. Try again.</StatusMessage></div>}
    <section className="deck-grid library-grid" aria-label="Decks">
      {decks.map(deck => <div className={`library-deck${selection.includes(deck.slug) ? " is-selected" : ""}`} key={deck.slug}>
        <DeckCard fen={deck.previewFen} label={deck.name} onClick={() => onSelectDeck(deck)}>
          <span className="deck-card-description">{deck.description}</span>
        </DeckCard>
        <label className="deck-selection-control">
          <input type="checkbox" aria-label={`Select ${deck.name}`} checked={selection.includes(deck.slug)} disabled={starting} onChange={event => {
            setSelected(current => event.target.checked ? [...current, deck.slug] : current.filter(slug => slug !== deck.slug));
          }} />
        </label>
      </div>)}
    </section>
    <DeckViews decks={decks} onPractice={view => navigateToDeckView(view.id)} />
  </main>;
}
