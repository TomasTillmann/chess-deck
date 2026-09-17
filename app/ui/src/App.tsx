import { useEffect, useState } from "react";
import "./App.css";
import { DeckGrid } from "./components/DeckGrid";
import { DeckPositionGrid } from "./components/DeckPositionGrid";
import { SolverPage } from "./pages/SolverPage";
import { PageHeader } from "./design-system";
import { fetchDecks, type Deck } from "./decks";
import { routeFromHash, navigateToDeck, navigateToDecks, navigateToPosition } from "./routing";

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [attempt, setAttempt] = useState(0);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [deckLoadError, setDeckLoadError] = useState<string | undefined>();

  useEffect(() => {
    let isCurrent = true;

    fetchDecks()
      .then(loadedDecks => {
        if (!isCurrent) return;
        setDecks(loadedDecks);
        setDeckLoadError(undefined);
      })
      .catch(error => {
        if (!isCurrent) return;
        setDeckLoadError(error instanceof Error ? error.message : "Failed to load collections");
      })
      .finally(() => {
        if (isCurrent) setIsLoadingDecks(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(routeFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectedDeck = route.view === "decks" ? undefined : decks.find(deck => deck.slug === route.slug);

  if (isLoadingDecks) {
    return (
      <main className="deck-page">
        <PageHeader title="Decks">Loading positions</PageHeader>
      </main>
    );
  }

  if (deckLoadError) {
    return (
      <main className="deck-page">
        <PageHeader title="Decks">{deckLoadError}</PageHeader>
      </main>
    );
  }

  if (selectedDeck && route.view === "deck") {
    return (
      <DeckPositionGrid
        key={selectedDeck.slug}
        deck={selectedDeck}
        onSelectPosition={positionIndex => navigateToPosition(selectedDeck, positionIndex)}
        onGoToDecks={navigateToDecks}
      />
    );
  }

  if (selectedDeck && route.view === "position" && selectedDeck.fens[route.positionIndex]) {
    return (
      <SolverPage
        key={`${selectedDeck.slug}:${route.positionIndex}:${attempt}`}
        deck={selectedDeck}
        positionIndex={route.positionIndex}
        onGoToDeck={() => navigateToDeck(selectedDeck)}
        onGoToPosition={(positionIndex, preserveScroll) => {
          if (positionIndex === route.positionIndex) setAttempt(value => value + 1);
          else navigateToPosition(selectedDeck, positionIndex, preserveScroll);
        }}
      />
    );
  }

  return <DeckGrid decks={decks} onSelectDeck={navigateToDeck} />;
}
