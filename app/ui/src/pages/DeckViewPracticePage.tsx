import { useEffect, useState } from "react";
import type { Deck } from "../decks";
import { fetchDeckView, type DeckView } from "../deckViewClient";
import { Button, Icon, PageHeader, StatusMessage } from "../design-system";
import { navigateToDeckViews } from "../routing";
import { PracticePage } from "./PracticePage";

export function DeckViewPracticePage({ viewId, onDecksChange }: { viewId: string; onDecksChange: (decks: Deck[]) => void }) {
  const [view, setView] = useState<DeckView>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    fetchDeckView(viewId).then(result => { if (active) setView(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [viewId, attempt]);

  if (view) return <PracticePage collections={view.collections} title={view.name} onDecksChange={onDecksChange} onGoBack={navigateToDeckViews} backLabel="Go to deck views" />;

  return <main className="deck-page">
    <PageHeader title="Deck View" actions={<Button onClick={navigateToDeckViews}><Icon name="arrow-left" />Go to deck views</Button>} />
    <div className="practice-status">
      <StatusMessage role="status">{error ? "Could not load this deck view." : "Loading practice…"}</StatusMessage>
      {error && <Button onClick={() => setAttempt(current => current + 1)}>Retry</Button>}
    </div>
  </main>;
}
