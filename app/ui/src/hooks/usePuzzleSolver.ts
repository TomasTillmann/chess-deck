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
import type { Deck } from "../decks";
import {
  createMoveRoot,
  deleteNodeAtPath,
  moveNodeAmongSiblings,
  nodeAtPath,
  updateNodeAtPath,
  type MovePath,
  type MoveTreeNode,
} from "../gameTree";
import { fetchSolution, SolutionFetchError, updateSolution, type SolutionDocument } from "../solutionClient";
import { compareSolutionTree, SolutionComparisonError } from "../solutionComparison";

const emptyDests = new Map() as Dests;

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

export function usePuzzleSolver(deck: Deck, positionIndex: number) {
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
  const submissionVersion = useRef(0);

  useEffect(() => () => { submissionVersion.current += 1; }, []);

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
    submissionVersion.current += 1;
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
    const version = ++submissionVersion.current;
    const submittedGame = gameRef.current;
    setSubmitState({ status: "loading" });

    try {
      const solution = await fetchSolution(deck.slug, initialFen);
      if (version !== submissionVersion.current) return;
      setSolutionReviewReasons(reviewReasons(solution));
      setCanUpdateSolution(true);
      const result = compareSolutionTree(initialFen, submittedGame.root, solution);
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
      if (version !== submissionVersion.current) return;
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

  return {
    initialFen,
    game,
    submitState,
    updateState,
    canUpdateSolution,
    solutionReviewReasons,
    currentFen,
    lastMove,
    boardOrientation,
    position,
    canMove,
    movableDests,
    goToPath,
    movePathUp,
    movePathDown,
    deleteMoveTreeAtPath,
    handleMove,
    handleSubmit,
    handleUpdateSolution,
  };
}
