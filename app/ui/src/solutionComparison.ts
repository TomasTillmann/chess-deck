import {
  Chess,
  fen as chessFen,
  isNormal,
  makeSquare,
  parseUci,
  san as chessSan,
  type Move,
} from "chessops";
import type { Key } from "@lichess-org/chessground/types";

import type { MoveReview, MoveTreeNode } from "./gameTree";
import type { SolutionDocument } from "./solutionClient";

type SolutionPositionNode = {
  readonly fen?: unknown;
  readonly moves?: unknown;
};

type SolutionMoveEdge = {
  readonly uci?: unknown;
  readonly children?: unknown;
};

export type SolutionComparisonResult = {
  readonly matchingMoves: number;
  readonly solutionMoveCount: number;
  readonly userMoveCount: number;
  readonly score: number;
  readonly reviewRoot: MoveTreeNode;
};

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function moveLastMove(move: Move): Key[] | undefined {
  if (!isNormal(move)) return undefined;

  return [makeSquare(move.from), makeSquare(move.to)] as Key[];
}

function isPositionNode(value: unknown): value is SolutionPositionNode {
  return typeof value === "object" && value !== null;
}

function isMoveEdge(value: unknown): value is SolutionMoveEdge {
  return typeof value === "object" && value !== null;
}

function legalMoveFromUci(position: Chess, uci: string): Move {
  const parsed = parseUci(uci);
  if (!parsed || !position.isLegal(parsed)) {
    throw new Error(`Invalid solution move ${uci}`);
  }

  return parsed;
}

function childPositionNodes(edge: SolutionMoveEdge): SolutionPositionNode[] {
  if (!Array.isArray(edge.children)) return [];

  return edge.children.filter(isPositionNode);
}

function normalizePositionNode(positionNode: SolutionPositionNode, parentFen: string, ply: number): MoveTreeNode[] {
  if (!Array.isArray(positionNode.moves)) return [];

  return positionNode.moves.filter(isMoveEdge).flatMap(edge => normalizeMoveEdge(edge, parentFen, ply));
}

function normalizeMoveEdge(edge: SolutionMoveEdge, parentFen: string, ply: number): MoveTreeNode[] {
  if (typeof edge.uci !== "string" || !edge.uci.trim()) return [];

  const position = positionFromFen(parentFen);
  const move = legalMoveFromUci(position, edge.uci);
  const san = chessSan.makeSan(position, move);
  const nextPosition = position.clone();
  nextPosition.play(move);
  const nextFen = chessFen.makeFen(nextPosition.toSetup());
  const childNodes = childPositionNodes(edge);
  const children = childNodes.flatMap(child => normalizePositionNode(child, nextFen, ply + 1));

  return [
    {
      id: edge.uci,
      fen: nextFen,
      lastMove: moveLastMove(move),
      move: {
        ply,
        san,
        uci: edge.uci,
        color: position.turn,
        moveNumber: position.fullmoves,
      },
      children,
    },
  ];
}

export function normalizeSolutionTree(initialFen: string, solution: SolutionDocument): MoveTreeNode {
  const root = isPositionNode(solution.root) ? solution.root : undefined;

  return {
    id: "root",
    fen: initialFen,
    children: root ? normalizePositionNode(root, initialFen, 1) : [],
  };
}

function countMoves(node: MoveTreeNode): number {
  return node.children.reduce((total, child) => total + 1 + countMoves(child), 0);
}

function childByUci(node: MoveTreeNode): Map<string, MoveTreeNode> {
  return new Map(node.children.flatMap(child => (child.move ? [[child.move.uci, child]] : [])));
}

function countMatchingMoves(userNode: MoveTreeNode, solutionNode: MoveTreeNode): number {
  const solutionChildren = childByUci(solutionNode);

  return userNode.children.reduce((total, userChild) => {
    if (!userChild.move) return total;

    const solutionChild = solutionChildren.get(userChild.move.uci);
    if (!solutionChild) return total;

    return total + 1 + countMatchingMoves(userChild, solutionChild);
  }, 0);
}

function markBranch(node: MoveTreeNode, review: MoveReview): MoveTreeNode {
  return {
    ...node,
    review,
    children: node.children.map(child => markBranch(child, review)),
  };
}

function sharedNode(node: MoveTreeNode, children: MoveTreeNode[]): MoveTreeNode {
  const nextNode: MoveTreeNode = {
    ...node,
    children,
  };
  delete nextNode.review;
  return nextNode;
}

function mergeReviewNode(userNode: MoveTreeNode, solutionNode: MoveTreeNode): MoveTreeNode {
  const solutionChildren = childByUci(solutionNode);
  const usedSolutionMoves = new Set<string>();

  const userChildren = userNode.children.map(userChild => {
    const uci = userChild.move?.uci;
    const solutionChild = uci ? solutionChildren.get(uci) : undefined;

    if (!uci || !solutionChild) {
      return markBranch(userChild, "user-extra");
    }

    usedSolutionMoves.add(uci);
    return mergeReviewNode(userChild, solutionChild);
  });

  const missingSolutionChildren = solutionNode.children
    .filter(solutionChild => solutionChild.move && !usedSolutionMoves.has(solutionChild.move.uci))
    .map(solutionChild => markBranch(solutionChild, "solution-missing"));

  return sharedNode(userNode, [...userChildren, ...missingSolutionChildren]);
}

function score(matchingMoves: number, solutionMoveCount: number, userMoveCount: number): number {
  if (solutionMoveCount === 0 && userMoveCount === 0) return 100;
  if (solutionMoveCount + userMoveCount === 0) return 0;

  return Math.round(((2 * matchingMoves) / (solutionMoveCount + userMoveCount)) * 100);
}

export function compareSolutionTree(
  initialFen: string,
  userRoot: MoveTreeNode,
  solution: SolutionDocument,
): SolutionComparisonResult {
  const solutionRoot = normalizeSolutionTree(initialFen, solution);
  const matchingMoves = countMatchingMoves(userRoot, solutionRoot);
  const solutionMoveCount = countMoves(solutionRoot);
  const userMoveCount = countMoves(userRoot);

  return {
    matchingMoves,
    solutionMoveCount,
    userMoveCount,
    score: score(matchingMoves, solutionMoveCount, userMoveCount),
    reviewRoot: mergeReviewNode(userRoot, solutionRoot),
  };
}
