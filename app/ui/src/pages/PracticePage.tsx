import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDecks, type Deck } from "../decks";
import { Button, Icon, PageHeader, StatusMessage } from "../design-system";
import { fetchPracticeQueue, reviewDate, type PracticeQueue } from "../reviewClient";
import { navigateToDecks } from "../routing";
import { SolverPage } from "./SolverPage";

type Position = { deck: Deck; positionIndex: number };
type PracticeSession = {
  positions: Position[];
  positionIndex: number;
  queue: PracticeQueue;
  attempt: number;
};

type PracticePageProps = {
  collections?: readonly string[];
  title?: string;
  onDecksChange: (decks: Deck[]) => void;
};

export function PracticePage(props: PracticePageProps) {
  return <PracticeScope key={JSON.stringify(props.collections ?? null)} {...props} />;
}

// A scope is only a view: every position keeps its source deck and review identity.
function PracticeScope({ collections, title: viewTitle, onDecksChange }: PracticePageProps) {
  const [session, setSession] = useState<PracticeSession>();
  const [error, setError] = useState(false);
  const requestVersion = useRef(0);
  const title = viewTitle ?? (collections ? "Practice selected decks" : "Practice All");

  const loadNext = useCallback(async () => {
    const version = ++requestVersion.current;
    const [decks, queue] = await Promise.all([fetchDecks(), fetchPracticeQueue(collections)]);
    if (version !== requestVersion.current) return;
    const positions = decks.filter(deck => !collections || collections.includes(deck.slug)).flatMap(deck => {
      const seen = new Set<string>();
      return deck.fens.flatMap((fen, positionIndex) => {
        if (seen.has(fen)) return [];
        seen.add(fen);
        return [{ deck, positionIndex }];
      });
    });
    const recommended = queue.recommendedCard;
    const positionIndex = recommended ? positions.findIndex(({ deck, positionIndex }) =>
      deck.slug === recommended.collection && deck.fens[positionIndex] === recommended.fen) : -1;
    if (recommended && positionIndex < 0) throw new Error("Recommended position is unavailable");
    onDecksChange(decks);
    setSession({ positions, positionIndex, queue, attempt: version });
    setError(false);
  }, [collections, onDecksChange]);

  useEffect(() => {
    let current = true;
    if (collections?.length !== 0) void loadNext().catch(() => { if (current) setError(true); });
    return () => { current = false; requestVersion.current++; };
  }, [collections, loadNext]);

  const position = session?.positions[session.positionIndex];

  useEffect(() => {
    if (!session || position) return;
    const refresh = () => { void loadNext().catch(() => setError(true)); };
    window.addEventListener("focus", refresh);
    const untilDue = session.queue.nextDueAt ? Date.parse(session.queue.nextDueAt) - Date.parse(session.queue.serverNow) : undefined;
    const timer = untilDue === undefined ? undefined : window.setTimeout(refresh, Math.min(2_147_483_647, Math.max(1000, untilDue + 250)));
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearTimeout(timer);
    };
  }, [session, position, loadNext]);

  function selectPosition(positionIndex: number) {
    const attempt = ++requestVersion.current;
    setSession(current => current ? { ...current, positionIndex, attempt } : current);
  }

  if (session && position) return <SolverPage
    key={`${position.deck.slug}:${position.deck.fens[position.positionIndex]}:${session.attempt}`}
    deck={position.deck}
    positionIndex={position.positionIndex}
    onGoToDeck={navigateToDecks}
    onGoToPosition={sourceIndex => selectPosition(session.positions.findIndex(item => item.deck.slug === position.deck.slug && item.positionIndex === sourceIndex))}
    navigation={{
      previous: session.positionIndex > 0 ? () => selectPosition(session.positionIndex - 1) : undefined,
      next: session.positionIndex + 1 < session.positions.length ? () => selectPosition(session.positionIndex + 1) : undefined,
    }}
    backLabel="Go to decks"
    practiceLabel={title}
    onLoadNextReview={loadNext}
    allowSolutionEditing={false}
  />;

  return <main className="deck-page">
    <PageHeader title={title} actions={<Button onClick={navigateToDecks}><Icon name="arrow-left" />Go to decks</Button>} />
    <div className="practice-status">
      {error ? <>
        <StatusMessage role="status">Could not load practice.</StatusMessage>
        <Button onClick={() => { setError(false); void loadNext().catch(() => setError(true)); }}>Retry</Button>
      </> : <StatusMessage role="status">{collections?.length === 0 || session?.positions.length === 0
        ? "No positions available."
        : session ? `All caught up.${session.queue.nextDueAt ? ` Next review: ${reviewDate(session.queue.nextDueAt)}.` : ""}`
          : "Loading practice…"}</StatusMessage>}
    </div>
  </main>;
}
