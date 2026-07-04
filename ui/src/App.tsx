import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chess,
  compat,
  fen as chessFen,
  isNormal,
  makeSquare,
  makeUci,
  parseSquare,
  parseUci,
  san as chessSan,
  squareRank,
  type Move,
  type Square,
} from "chessops";
import type { Dests, Key } from "@lichess-org/chessground/types";

import "./App.css";
import { ChessBoard } from "./components/ChessBoard";
import { DeckGrid, DeckPositionGrid } from "./components/DeckGrid";
import { MoveNotationPanel, type MoveRecord } from "./components/MoveNotationPanel";
import { decks, type Deck } from "./decks";
import { bestMove as stockfishBestMove, dispose as disposeStockfish } from "./engine/stockfishClient";

const engineDepth = 8;
const emptyDests = new Map() as Dests;

type HistoryEntry = {
  fen: string;
  lastMove?: Key[];
  move?: MoveRecord;
};

type GameState = {
  history: HistoryEntry[];
  currentPly: number;
};

type Route =
  | { view: "decks" }
  | { view: "deck"; slug: string }
  | { view: "position"; slug: string; positionIndex: number };

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function isPromotion(position: Chess, from: Square, to: Square): boolean {
  const piece = position.board.get(from);

  return piece?.role === "pawn" && (squareRank(to) === 0 || squareRank(to) === 7);
}

function moveLastMove(move: Move): Key[] | undefined {
  if (!isNormal(move)) return undefined;

  return [makeSquare(move.from), makeSquare(move.to)] as Key[];
}

function appendOrSelectMove(history: HistoryEntry[], fromPly: number, position: Chess, move: Move) {
  const uci = makeUci(move);
  const existing = history[fromPly + 1]?.move;

  if (existing?.uci === uci) {
    return {
      history,
      currentPly: fromPly + 1,
      position: positionFromFen(history[fromPly + 1].fen),
      appended: false,
    };
  }

  const nextPosition = position.clone();
  const san = chessSan.makeSan(position, move);
  nextPosition.play(move);

  const nextPly = fromPly + 1;
  const nextEntry: HistoryEntry = {
    fen: chessFen.makeFen(nextPosition.toSetup()),
    lastMove: moveLastMove(move),
    move: {
      ply: nextPly,
      san,
      uci,
      color: position.turn,
      moveNumber: position.fullmoves,
    },
  };

  return {
    history: [...history.slice(0, nextPly), nextEntry],
    currentPly: nextPly,
    position: nextPosition,
    appended: true,
  };
}

function clampPly(ply: number, history: HistoryEntry[]): number {
  return Math.min(Math.max(ply, 0), history.length - 1);
}

function routeFromHash(): Route {
  const positionMatch = window.location.hash.match(/^#\/decks\/([^/]+)\/positions\/(\d+)$/);

  if (positionMatch) {
    return {
      view: "position",
      slug: decodeURIComponent(positionMatch[1]),
      positionIndex: Number(positionMatch[2]) - 1,
    };
  }

  const deckMatch = window.location.hash.match(/^#\/decks\/([^/]+)$/);
  if (deckMatch) return { view: "deck", slug: decodeURIComponent(deckMatch[1]) };

  return { view: "decks" };
}

function navigateToDeck(deck: Deck) {
  window.location.hash = `/decks/${encodeURIComponent(deck.slug)}`;
}

function navigateToPosition(deck: Deck, positionIndex: number) {
  window.location.hash = `/decks/${encodeURIComponent(deck.slug)}/positions/${positionIndex + 1}`;
}

function navigateToDecks() {
  window.location.hash = "/";
}

function SolverPage({
  deck,
  positionIndex,
  onGoToDeck,
  onGoToPosition,
}: {
  deck: Deck;
  positionIndex: number;
  onGoToDeck: () => void;
  onGoToPosition: (positionIndex: number) => void;
}) {
  const initialFen = deck.fens[positionIndex] ?? deck.previewFen;
  const [game, setGame] = useState<GameState>({
    history: [{ fen: initialFen }],
    currentPly: 0,
  });
  const [engineThinking, setEngineThinking] = useState(false);
  const [engineError, setEngineError] = useState<string>();
  const currentEntry = game.history[game.currentPly];
  const currentFen = currentEntry.fen;
  const lastMove = currentEntry.lastMove;
  const currentFenRef = useRef(currentFen);
  const gameRef = useRef(game);

  const humanColor = useMemo(() => positionFromFen(initialFen).turn, [initialFen]);
  const position = useMemo(() => positionFromFen(currentFen), [currentFen]);
  const canHumanMove = position.turn === humanColor && !engineThinking && !position.isEnd();
  const movableDests = useMemo(
    () => (canHumanMove ? (compat.chessgroundDests(position) as Dests) : emptyDests),
    [canHumanMove, position],
  );

  useEffect(() => {
    currentFenRef.current = currentFen;
    gameRef.current = game;
  }, [currentFen, game]);

  useEffect(() => disposeStockfish, []);

  useEffect(() => {
    setGame({
      history: [{ fen: initialFen }],
      currentPly: 0,
    });
    setEngineThinking(false);
    setEngineError(undefined);
  }, [initialFen]);

  const goToPly = useCallback((ply: number) => {
    setGame(current => ({
      ...current,
      currentPly: clampPly(ply, current.history),
    }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPly(gameRef.current.currentPly - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPly(gameRef.current.currentPly + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPly]);

  const playEngineMove = useCallback(async (fenAfterHumanMove: string, expectedPly: number) => {
    setEngineThinking(true);
    setEngineError(undefined);

    try {
      const uci = await stockfishBestMove(fenAfterHumanMove, engineDepth);
      if (currentFenRef.current !== fenAfterHumanMove || gameRef.current.currentPly !== expectedPly) return;

      const enginePosition = positionFromFen(fenAfterHumanMove);
      const move = parseUci(uci);

      if (!move || !isNormal(move) || !enginePosition.isLegal(move)) {
        throw new Error(`Stockfish returned an illegal move: ${uci}`);
      }

      setGame(current => {
        if (current.currentPly !== expectedPly || current.history[expectedPly]?.fen !== fenAfterHumanMove) {
          return current;
        }

        const result = appendOrSelectMove(current.history, expectedPly, enginePosition, move);
        return {
          history: result.history,
          currentPly: result.currentPly,
        };
      });
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : "Stockfish failed to move.");
    } finally {
      setEngineThinking(false);
    }
  }, []);

  const handleMove = useCallback(
    (orig: Key, dest: Key) => {
      if (!canHumanMove) return;

      const from = parseSquare(orig);
      const to = parseSquare(dest);

      if (from === undefined || to === undefined) return;

      const move: Move = { from, to };
      if (isPromotion(position, from, to)) move.promotion = "queen";
      if (!position.isLegal(move)) return;

      const result = appendOrSelectMove(gameRef.current.history, gameRef.current.currentPly, position, move);
      setGame({
        history: result.history,
        currentPly: result.currentPly,
      });

      if (result.currentPly === result.history.length - 1 && result.position.turn !== humanColor && !result.position.isEnd()) {
        void playEngineMove(result.history[result.currentPly].fen, result.currentPly);
      }
    },
    [canHumanMove, humanColor, playEngineMove, position],
  );

  const moves = useMemo(() => game.history.flatMap(entry => (entry.move ? [entry.move] : [])), [game.history]);
  const isAtLatestPly = game.currentPly === game.history.length - 1;
  const currentMoveLabel = game.currentPly === 0 ? "start" : `move ${game.currentPly}`;
  const previousPositionIndex = positionIndex - 1;
  const nextPositionIndex = positionIndex + 1;
  const statusText = engineError
    ? engineError
    : position.isEnd()
      ? "Game over"
      : !isAtLatestPly
        ? `Viewing ${currentMoveLabel}`
        : engineThinking
        ? "Engine thinking"
        : position.turn === humanColor
          ? "Your move"
          : "Engine to move";

  return (
    <main className="app-shell solver-shell">
      <div className="solver-view">
        <div className="position-nav">
          <button className="deck-back-button" type="button" onClick={onGoToDeck}>
            Go to deck
          </button>
          <button
            className="position-arrow-button"
            type="button"
            aria-label="Previous position"
            title="Previous position"
            disabled={previousPositionIndex < 0}
            onClick={() => onGoToPosition(previousPositionIndex)}
          >
            &#9664;
          </button>
          <button
            className="position-arrow-button"
            type="button"
            aria-label="Next position"
            title="Next position"
            disabled={nextPositionIndex >= deck.fens.length}
            onClick={() => onGoToPosition(nextPositionIndex)}
          >
            &#9654;
          </button>
        </div>
        <div className="play-layout">
          <section className="board-stage" aria-labelledby="position-title">
            <div className="position-header">
              <h1 id="position-title">
                {deck.name} - Position {positionIndex + 1}
              </h1>
              <p>{statusText}</p>
            </div>
            <ChessBoard
              fen={currentFen}
              orientation={humanColor}
              turnColor={position.turn}
              movableColor={canHumanMove ? humanColor : undefined}
              movableDests={movableDests}
              check={position.isCheck()}
              lastMove={lastMove}
              onMove={handleMove}
            />
          </section>
          <MoveNotationPanel moves={moves} currentPly={game.currentPly} onSelectPly={goToPly} />
        </div>
      </div>
    </main>
  );
}

export function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const handleHashChange = () => setRoute(routeFromHash());

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectedDeck = route.view === "decks" ? undefined : decks.find(deck => deck.slug === route.slug);

  if (selectedDeck && route.view === "deck") {
    return (
      <DeckPositionGrid
        deck={selectedDeck}
        onSelectPosition={positionIndex => navigateToPosition(selectedDeck, positionIndex)}
        onGoToDecks={navigateToDecks}
      />
    );
  }

  if (selectedDeck && route.view === "position" && selectedDeck.fens[route.positionIndex]) {
    return (
      <SolverPage
        deck={selectedDeck}
        positionIndex={route.positionIndex}
        onGoToDeck={() => navigateToDeck(selectedDeck)}
        onGoToPosition={positionIndex => navigateToPosition(selectedDeck, positionIndex)}
      />
    );
  }

  return <DeckGrid decks={decks} onSelectDeck={navigateToDeck} />;
}
