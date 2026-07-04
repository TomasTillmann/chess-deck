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
import { MoveNotationPanel } from "./components/MoveNotationPanel";
import { decks, type Deck } from "./decks";
import { bestMove as stockfishBestMove, dispose as disposeStockfish } from "./engine/stockfishClient";
import {
  createMoveRoot,
  nodeAtPath,
  pathsEqual,
  updateNodeAtPath,
  type MovePath,
  type MoveTreeNode,
} from "./gameTree";

const engineDepth = 8;
const emptyDests = new Map() as Dests;

type GameState = {
  root: MoveTreeNode;
  currentPath: MovePath;
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

function nextMoveId(parent: MoveTreeNode, uci: string): string {
  let id = uci;
  let suffix = 2;

  while (parent.children.some(child => child.id === id)) {
    id = `${uci}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function appendOrSelectMove(root: MoveTreeNode, fromPath: MovePath, position: Chess, move: Move) {
  const parent = nodeAtPath(root, fromPath);
  const uci = makeUci(move);
  const existing = parent.children.find(child => child.move?.uci === uci);

  if (existing) {
    return {
      root,
      currentPath: [...fromPath, existing.id],
      node: existing,
      position: positionFromFen(existing.fen),
      appended: false,
    };
  }

  const nextPosition = position.clone();
  const san = chessSan.makeSan(position, move);
  nextPosition.play(move);

  const nextPly = fromPath.length + 1;
  const nextNode: MoveTreeNode = {
    id: nextMoveId(parent, uci),
    fen: chessFen.makeFen(nextPosition.toSetup()),
    lastMove: moveLastMove(move),
    move: {
      ply: nextPly,
      san,
      uci,
      color: position.turn,
      moveNumber: position.fullmoves,
    },
    children: [],
  };
  const nextPath = [...fromPath, nextNode.id];

  return {
    root: updateNodeAtPath(root, fromPath, node => ({
      ...node,
      children: [...node.children, nextNode],
    })),
    currentPath: nextPath,
    node: nextNode,
    position: nextPosition,
    appended: true,
  };
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
    root: createMoveRoot(initialFen),
    currentPath: [],
  });
  const [engineThinking, setEngineThinking] = useState(false);
  const [engineError, setEngineError] = useState<string>();
  const currentEntry = nodeAtPath(game.root, game.currentPath);
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
      root: createMoveRoot(initialFen),
      currentPath: [],
    });
    setEngineThinking(false);
    setEngineError(undefined);
  }, [initialFen]);

  const goToPath = useCallback((path: MovePath) => {
    setGame(current => ({
      ...current,
      currentPath: path,
    }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPath(gameRef.current.currentPath.slice(0, -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const currentNode = nodeAtPath(gameRef.current.root, gameRef.current.currentPath);
        const nextNode = currentNode.children[0];
        if (nextNode) goToPath([...gameRef.current.currentPath, nextNode.id]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPath]);

  const playEngineMove = useCallback(async (fenAfterHumanMove: string, expectedPath: MovePath) => {
    setEngineThinking(true);
    setEngineError(undefined);

    try {
      const uci = await stockfishBestMove(fenAfterHumanMove, engineDepth);
      if (currentFenRef.current !== fenAfterHumanMove || !pathsEqual(gameRef.current.currentPath, expectedPath)) return;

      const enginePosition = positionFromFen(fenAfterHumanMove);
      const move = parseUci(uci);

      if (!move || !isNormal(move) || !enginePosition.isLegal(move)) {
        throw new Error(`Stockfish returned an illegal move: ${uci}`);
      }

      setGame(current => {
        if (!pathsEqual(current.currentPath, expectedPath) || nodeAtPath(current.root, expectedPath).fen !== fenAfterHumanMove) {
          return current;
        }

        const result = appendOrSelectMove(current.root, expectedPath, enginePosition, move);
        return {
          root: result.root,
          currentPath: result.currentPath,
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

      const result = appendOrSelectMove(gameRef.current.root, gameRef.current.currentPath, position, move);
      const nextGame = {
        root: result.root,
        currentPath: result.currentPath,
      };

      setGame(nextGame);
      gameRef.current = nextGame;
      currentFenRef.current = result.node.fen;

      if (result.node.children.length === 0 && result.position.turn !== humanColor && !result.position.isEnd()) {
        void playEngineMove(result.node.fen, result.currentPath);
      }
    },
    [canHumanMove, humanColor, playEngineMove, position],
  );

  const isAtLatestPly = currentEntry.children.length === 0;
  const currentMoveLabel = game.currentPath.length === 0 ? "start" : `move ${game.currentPath.length}`;
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
          <MoveNotationPanel root={game.root} currentPath={game.currentPath} onSelectPath={goToPath} />
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
