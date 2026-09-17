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
import { canonicalMove } from "../chessMoves";

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

export type PromotionRole = "queen" | "rook" | "bishop" | "knight";
const promotionRoles: PromotionRole[] = ["queen", "rook", "bishop", "knight"];
type PendingPromotion = { orig: Key; dest: Key; choices: PromotionRole[] };

export function resolveBoardMove(position: Chess, orig: Key, dest: Key, promotion?: PromotionRole): { move: Move } | { promotions: PromotionRole[] } | undefined {
  const from = parseSquare(orig);
  const to = parseSquare(dest);
  if (from === undefined || to === undefined || (promotion !== undefined && !promotionRoles.includes(promotion))) return;
  if (isPromotion(position, from, to) && !promotion) {
    const promotions = promotionRoles.filter(role => position.isLegal({ from, to, promotion: role }));
    return promotions.length ? { promotions } : undefined;
  }
  const move: Move = { from, to, ...(promotion ? { promotion } : {}) };
  return position.isLegal(move) ? { move } : undefined;
}

export function parseKeyboardMove(position: Chess, text: string): { orig: Key; dest: Key; promotion?: PromotionRole } | undefined {
  const input = text.trim();
  const move = parseUci(input) ?? chessSan.parseSan(position, input);
  if (!move || !isNormal(move)) return;
  const promotion = promotionRoles.find(role => role === move.promotion);
  if (move.promotion && !promotion) return;
  const orig = makeSquare(move.from);
  const dest = makeSquare(move.to);
  return resolveBoardMove(position, orig, dest, promotion) ? { orig, dest, promotion } : undefined;
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

export function appendOrSelectMove(root: MoveTreeNode, fromPath: MovePath, position: Chess, move: Move) {
  move = canonicalMove(position, move);
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
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>();
  const currentEntry = nodeAtPath(game.root, game.currentPath);
  const currentFen = currentEntry.fen;
  const lastMove = currentEntry.lastMove;
  const gameRef = useRef(game);
  const submissionVersion = useRef(0);
  const updateRequest = useRef<object | null>(null);

  useEffect(() => () => {
    submissionVersion.current += 1;
    updateRequest.current = null;
  }, []);

  const boardOrientation = useMemo(() => positionFromFen(initialFen).turn, [initialFen]);
  const position = useMemo(() => positionFromFen(currentFen), [currentFen]);
  const canMove = !position.isEnd() && !pendingPromotion;
  const movableDests = useMemo(
    () => (canMove ? (compat.chessgroundDests(position) as Dests) : emptyDests),
    [canMove, position],
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    updateRequest.current = null;
    setPendingPromotion(undefined);
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
    setPendingPromotion(undefined);
    const nextGame = {
      ...gameRef.current,
      currentPath: path,
    };

    setGame(nextGame);
    gameRef.current = nextGame;
  }, []);

  const markTreeEdited = useCallback(() => {
    setPendingPromotion(undefined);
    submissionVersion.current += 1;
    setSubmitState({ status: "idle" });
    if (!updateRequest.current) setUpdateState({ status: "idle" });
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
      if (target?.closest("input, textarea, select, dialog")) return;

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
    (orig: Key, dest: Key, promotion?: PromotionRole): "moved" | "promotion" | "invalid" => {
      if (pendingPromotion && (orig !== pendingPromotion.orig || dest !== pendingPromotion.dest || !promotion)) return "invalid";
      const editPath = gameRef.current.currentPath;
      const editPosition = positionFromFen(nodeAtPath(gameRef.current.root, editPath).fen);
      if (editPosition.isEnd()) return "invalid";
      const resolved = resolveBoardMove(editPosition, orig, dest, promotion);
      if (!resolved) return "invalid";
      if ("promotions" in resolved) {
        setPendingPromotion({ orig, dest, choices: resolved.promotions });
        return "promotion";
      }

      markTreeEdited();
      const result = appendOrSelectMove(gameRef.current.root, editPath, editPosition, resolved.move);
      const nextGame = {
        root: result.root,
        currentPath: result.currentPath,
      };

      setGame(nextGame);
      gameRef.current = nextGame;
      return "moved";
    },
    [markTreeEdited, pendingPromotion],
  );
  const cancelPromotion = useCallback(() => setPendingPromotion(undefined), []);
  const choosePromotion = useCallback((role: PromotionRole) => {
    if (pendingPromotion) handleMove(pendingPromotion.orig, pendingPromotion.dest, role);
  }, [handleMove, pendingPromotion]);
  const handleKeyboardMove = useCallback((text: string) => {
    const current = gameRef.current;
    const move = parseKeyboardMove(positionFromFen(nodeAtPath(current.root, current.currentPath).fen), text);
    return move ? handleMove(move.orig, move.dest, move.promotion) : "invalid";
  }, [handleMove]);

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
    if (updateRequest.current) return;
    const request = {};
    const version = submissionVersion.current;
    updateRequest.current = request;
    setUpdateState({ status: "loading" });
    let result: UpdateState = { status: "success" };

    try {
      await updateSolution(deck.slug, initialFen, gameRef.current.root);
    } catch {
      result = {
        status: "error",
        message: "Could not update the solution. Check that the server is running.",
      };
    }

    if (updateRequest.current !== request) return;
    updateRequest.current = null;
    if (version !== submissionVersion.current) {
      setUpdateState({ status: "idle" });
      return;
    }
    setUpdateState(result);
    if (result.status === "success") setSolutionReviewReasons(undefined);
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
    handleKeyboardMove,
    pendingPromotion,
    cancelPromotion,
    choosePromotion,
    handleSubmit,
    handleUpdateSolution,
  };
}
