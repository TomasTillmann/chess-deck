import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { DeckGrid } from "./components/DeckGrid";
import { DeckPositionGrid } from "./components/DeckPositionGrid";
import { DeckViews } from "./components/DeckViews";
import { SolverPage } from "./pages/SolverPage";
import { PracticePage } from "./pages/PracticePage";
import { DeckViewPracticePage } from "./pages/DeckViewPracticePage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { PageHeader } from "./design-system";
import { fetchDecks, type Deck } from "./decks";
import { fetchReviewQueue } from "./reviewClient";
import { loadDeckReview } from "./reviewCatalog";
import { routeFromHash, navigateToDeck, navigateToDecks, navigateToDeckView, navigateToPosition } from "./routing";

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [attempt, setAttempt] = useState(0);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [deckLoadError, setDeckLoadError] = useState<string | undefined>();
  const catalogVersion = useRef(0);
  const routeVersion = useRef(0);

  const receiveDecks = useCallback((loadedDecks: Deck[]) => {
    catalogVersion.current++;
    setDecks(loadedDecks);
    setDeckLoadError(undefined);
    setIsLoadingDecks(false);
  }, []);

  useEffect(() => {
    const version = ++catalogVersion.current;

    fetchDecks()
      .then(loadedDecks => {
        if (version !== catalogVersion.current) return;
        receiveDecks(loadedDecks);
      })
      .catch(error => {
        if (version !== catalogVersion.current) return;
        setDeckLoadError(error instanceof Error ? error.message : "Failed to load collections");
      })
      .finally(() => {
        if (version === catalogVersion.current) setIsLoadingDecks(false);
      });

    return () => {
      catalogVersion.current++;
    };
  }, [receiveDecks]);

  useEffect(() => {
    const handleHashChange = () => {
      routeVersion.current++;
      setRoute(routeFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      routeVersion.current++;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const selectedDeck = route.view === "deck" || route.view === "position" ? decks.find(deck => deck.slug === route.slug) : undefined;

  if (route.view === "practice") return route.viewId
    ? <DeckViewPracticePage key={route.viewId} viewId={route.viewId} onDecksChange={receiveDecks} />
    : <PracticePage onDecksChange={receiveDecks} />;

  if (route.view === "views") return <DeckViews decks={decks} onPractice={view => navigateToDeckView(view.id)} />;
  if (route.view === "statistics") return <StatisticsPage decks={decks} onDecksChange={receiveDecks} />;

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
        onDecksChange={receiveDecks}
      />
    );
  }

  if (selectedDeck && route.view === "position" && selectedDeck.fens[route.positionIndex]) {
    return (
      <SolverPage
        key={`${selectedDeck.slug}:${selectedDeck.fens[route.positionIndex]}:${attempt}`}
        deck={selectedDeck}
        positionIndex={route.positionIndex}
        onGoToDeck={() => navigateToDeck(selectedDeck)}
        onGoToPosition={(positionIndex, preserveScroll) => {
          if (positionIndex === route.positionIndex) setAttempt(value => value + 1);
          else navigateToPosition(selectedDeck, positionIndex, preserveScroll);
        }}
        onLoadNextReview={async () => {
          const version = routeVersion.current;
          const hash = window.location.hash;
          const currentFen = selectedDeck.fens[route.positionIndex];
          const result = await loadDeckReview(selectedDeck.slug, fetchDecks, fetchReviewQueue);
          if (version !== routeVersion.current || hash !== window.location.hash) return;
          receiveDecks(result.decks);
          const nextIndex = result.recommendedIndex >= 0
            ? result.recommendedIndex
            : result.deck.fens.indexOf(currentFen);
          if (nextIndex < 0) navigateToDeck(result.deck);
          else {
            if (result.recommendedIndex >= 0 && result.deck.fens[nextIndex] === currentFen) setAttempt(value => value + 1);
            if (nextIndex !== route.positionIndex || result.recommendedIndex >= 0) navigateToPosition(result.deck, nextIndex, true);
          }
        }}
      />
    );
  }

  return <DeckGrid decks={decks} onSelectDeck={navigateToDeck} />;
}
