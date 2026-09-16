import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chess,
  compat,
  fen as chessFen,
  isNormal,
  makeSquare,
  makeUci,
  parseSquare,
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
import { fetchDecks, type Deck } from "./decks";
import {
  createMoveRoot,
  deleteNodeAtPath,
  moveNodeAmongSiblings,
  nodeAtPath,
  updateNodeAtPath,
  type MovePath,
  type MoveTreeNode,
} from "./gameTree";
import { fetchSolution, SolutionFetchError, updateSolution, type SolutionDocument } from "./solutionClient";
import { compareSolutionTree, SolutionComparisonError } from "./solutionComparison";

const emptyDests = new Map() as Dests;
const reviewReasonLabels: Record<string, string> = {
  max_seconds: "Analysis time limit reached",
  max_depth: "Line needs deeper analysis",
  max_nodes: "More branches need analysis",
  candidate_limit: "Additional moves need checking",
  forcing_candidate_limit: "Additional forcing defenses need checking",
  ambiguous_root: "Several first moves appear equivalent",
  repetition_unresolved: "Repeating line needs review",
  empty_root: "No solution moves were found",
  analysis_unavailable: "Engine analysis was unavailable",
  checking_defense_analysis_unavailable: "A checking defense still needs analysis",
  root_mate_unconfirmed: "The mating line could not be confirmed",
  losing_root: "The starting position appears lost",
  solver_mated: "A line ends with the solving side checkmated",
  winning_line_drawn: "A winning line ends in a draw",
};

type GameState = {
  root: MoveTreeNode;
  currentPath: MovePath;
};

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; score: number }
  | { status: "error"; message: string };

type UpdateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

type Route =
  | { view: "decks" }
  | { view: "deck"; slug: string }
  | { view: "position"; slug: string; positionIndex: number };

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function reviewReasons(solution: SolutionDocument): string[] | undefined {
  if (solution.status !== "needs_review") return undefined;
  const quality = solution.quality;
  const reasons = typeof quality === "object" && quality !== null && "reviewReasons" in quality ? quality.reviewReasons : [];
  return Array.isArray(reasons) ? reasons.filter((reason): reason is string => typeof reason === "string") : [];
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
    const selected = { ...existing };
    delete selected.review;
    return {
      root: updateNodeAtPath(root, [...fromPath, existing.id], () => selected),
      currentPath: [...fromPath, existing.id],
      node: selected,
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
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });
  const [canUpdateSolution, setCanUpdateSolution] = useState(false);
  const [solutionReviewReasons, setSolutionReviewReasons] = useState<string[]>();
  const currentEntry = nodeAtPath(game.root, game.currentPath);
  const currentFen = currentEntry.fen;
  const lastMove = currentEntry.lastMove;
  const gameRef = useRef(game);

  const boardOrientation = useMemo(() => positionFromFen(initialFen).turn, [initialFen]);
  const position = useMemo(() => positionFromFen(currentFen), [currentFen]);
  const canMove = !position.isEnd();
  const movableDests = useMemo(
    () => (canMove ? (compat.chessgroundDests(position) as Dests) : emptyDests),
    [canMove, position],
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    setGame({
      root: createMoveRoot(initialFen),
      currentPath: [],
    });
    setSubmitState({ status: "idle" });
    setUpdateState({ status: "idle" });
    setCanUpdateSolution(false);
    setSolutionReviewReasons(undefined);
  }, [initialFen]);

  const goToPath = useCallback((path: MovePath) => {
    const nextGame = {
      ...gameRef.current,
      currentPath: path,
    };

    setGame(nextGame);
    gameRef.current = nextGame;
  }, []);

  const markTreeEdited = useCallback(() => {
    setSubmitState({ status: "idle" });
    setUpdateState({ status: "idle" });
  }, []);

  const movePathUp = useCallback((path: MovePath) => {
    markTreeEdited();
    const nextGame = {
      ...gameRef.current,
      root: moveNodeAmongSiblings(gameRef.current.root, path, -1),
      currentPath: path,
    };

    setGame(nextGame);
    gameRef.current = nextGame;
  }, [markTreeEdited]);

  const movePathDown = useCallback((path: MovePath) => {
    markTreeEdited();
    const nextGame = {
      ...gameRef.current,
      root: moveNodeAmongSiblings(gameRef.current.root, path, 1),
      currentPath: path,
    };

    setGame(nextGame);
    gameRef.current = nextGame;
  }, [markTreeEdited]);

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

  const deleteMoveTreeAtPath = useCallback((path: MovePath) => {
    markTreeEdited();
    const nextPath = path.slice(0, -1);
    const nextRoot = deleteNodeAtPath(gameRef.current.root, path);
    const nextGame = {
      root: nextRoot,
      currentPath: nextPath,
    };

    setGame(nextGame);
    gameRef.current = nextGame;
  }, [markTreeEdited]);

  const handleMove = useCallback(
    (orig: Key, dest: Key) => {
      if (!canMove) return;

      markTreeEdited();
      const editPath = gameRef.current.currentPath;
      const editPosition = positionFromFen(nodeAtPath(gameRef.current.root, editPath).fen);
      const from = parseSquare(orig);
      const to = parseSquare(dest);

      if (from === undefined || to === undefined) return;

      const move: Move = { from, to };
      if (isPromotion(editPosition, from, to)) move.promotion = "queen";

      if (!editPosition.isLegal(move)) {
        const nextGame = {
          ...gameRef.current,
          currentPath: editPath,
        };

        setGame(nextGame);
        gameRef.current = nextGame;
        return;
      }

      const result = appendOrSelectMove(gameRef.current.root, editPath, editPosition, move);
      const nextGame = {
        root: result.root,
        currentPath: result.currentPath,
      };

      setGame(nextGame);
      gameRef.current = nextGame;
    },
    [canMove, markTreeEdited],
  );

  const handleSubmit = useCallback(async () => {
    setSubmitState({ status: "loading" });

    try {
      const solution = await fetchSolution(deck.slug, initialFen);
      setSolutionReviewReasons(reviewReasons(solution));
      setCanUpdateSolution(true);
      const result = compareSolutionTree(initialFen, gameRef.current.root, solution);
      const nextGame = {
        root: result.reviewRoot,
        currentPath: gameRef.current.currentPath,
      };

      setGame(nextGame);
      gameRef.current = nextGame;
      setSubmitState({
        status: "success",
        score: result.score,
      });
    } catch (error) {
      const isMissingSolution = error instanceof SolutionFetchError && error.status === 404;

      setCanUpdateSolution(isMissingSolution || error instanceof SolutionComparisonError);
      setSubmitState({
        status: "error",
        message:
          error instanceof SolutionComparisonError
            ? error.message
            : isMissingSolution
            ? "No solution found for this position."
            : "Could not load the solution. Check that the server is running.",
      });
    }
  }, [deck.slug, initialFen]);

  const handleUpdateSolution = useCallback(async () => {
    setUpdateState({ status: "loading" });

    try {
      await updateSolution(deck.slug, initialFen, gameRef.current.root);
      setUpdateState({ status: "success" });
      setSolutionReviewReasons(undefined);
    } catch {
      setUpdateState({
        status: "error",
        message: "Could not update the solution. Check that the server is running.",
      });
    }
  }, [deck.slug, initialFen]);

  const previousPositionIndex = positionIndex - 1;
  const nextPositionIndex = positionIndex + 1;

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
            &#8249;
          </button>
          <button
            className="position-arrow-button"
            type="button"
            aria-label="Next position"
            title="Next position"
            disabled={nextPositionIndex >= deck.fens.length}
            onClick={() => onGoToPosition(nextPositionIndex)}
          >
            &#8250;
          </button>
        </div>
        <div className="play-layout">
          <section className="board-stage" aria-labelledby="position-title">
            <div className="position-header">
              <h1 id="position-title">
                {deck.name} - {positionIndex + 1}
              </h1>
            </div>
            <ChessBoard
              fen={currentFen}
              orientation={boardOrientation}
              turnColor={position.turn}
              movableColor={canMove ? position.turn : undefined}
              movableDests={movableDests}
              check={position.isCheck()}
              lastMove={lastMove}
              onMove={handleMove}
            />
            <div className="solution-submit-row">
              <button
                className="solution-submit-button"
                type="button"
                onClick={handleSubmit}
                disabled={submitState.status === "loading" || submitState.status === "success"}
              >
                Submit
              </button>
              {canUpdateSolution ? (
                <button
                  className="solution-update-button"
                  type="button"
                  onClick={handleUpdateSolution}
                  disabled={submitState.status === "loading" || updateState.status === "loading" || game.root.children.length === 0}
                >
                  {updateState.status === "loading" ? "Saving…" : "Save solution"}
                </button>
              ) : null}
              {solutionReviewReasons ? (
                <span className="solution-status is-provisional" role="status">
                  Provisional solution — engine analysis needs review.
                </span>
              ) : null}
              {submitState.status === "success" ? (
                <span className="solution-score" aria-live="polite">
                  {submitState.score}% coverage{solutionReviewReasons ? " (provisional)" : ""}
                </span>
              ) : null}
              {submitState.status === "error" ? (
                <span className="solution-status" role="status">
                  {submitState.message}
                </span>
              ) : null}
              {updateState.status === "success" ? (
                <span className="solution-status is-success" role="status">
                  Solution saved
                </span>
              ) : null}
              {updateState.status === "error" ? (
                <span className="solution-status" role="status">
                  {updateState.message}
                </span>
              ) : null}
            </div>
            <p className="solution-guidance">
              {canUpdateSolution
                ? "Blue moves were missed. Extra analysis has no penalty. One accepted move is enough on your turn; cover every required defense. Play moves to add lines; right-click a move to delete it. Save solution replaces the stored answer with this tree."
                : "Play your lines, then submit to review and edit the saved solution. One accepted move is enough on your turn; cover every required defense. Extra analysis has no penalty."}
            </p>
            {solutionReviewReasons && solutionReviewReasons.length > 0 ? (
              <details className="solution-guidance">
                <summary>Why this solution needs review</summary>
                <ul>{solutionReviewReasons.map((reason, index) => <li key={index}>{reviewReasonLabels[reason] ?? reason.replace(/_/g, " ")}</li>)}</ul>
              </details>
            ) : null}
          </section>
          <MoveNotationPanel
            root={game.root}
            currentPath={game.currentPath}
            onSelectPath={goToPath}
            onDeletePath={deleteMoveTreeAtPath}
            onMovePathUp={movePathUp}
            onMovePathDown={movePathDown}
          />
        </div>
      </div>
    </main>
  );
}

export function App() {
  const [route, setRoute] = useState(routeFromHash);
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
        <header className="deck-page-header">
          <h1>Decks</h1>
          <p>Loading positions</p>
        </header>
      </main>
    );
  }

  if (deckLoadError) {
    return (
      <main className="deck-page">
        <header className="deck-page-header">
          <h1>Decks</h1>
          <p>{deckLoadError}</p>
        </header>
      </main>
    );
  }

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
