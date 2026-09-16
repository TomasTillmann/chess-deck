import {
  Chess,
  fen as chessFen,
  isNormal,
  makeSquare,
  parseUci,
  san as chessSan,
  type Move,
  type Color,
} from "chessops";
import type { Key } from "@lichess-org/chessground/types";

import type { MoveReview, MoveTreeNode } from "./gameTree";
import type { SolutionDocument } from "./solutionClient";

type SolutionPositionNode = {
  readonly fen?: unknown;
  readonly moves?: unknown;
  readonly choice?: unknown;
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

export class SolutionComparisonError extends Error {}

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
    throw new SolutionComparisonError(`The saved solution contains an invalid move (${uci}). Edit the lines and save a corrected solution.`);
  }

  return parsed;
}

function childPositionNodes(edge: SolutionMoveEdge): SolutionPositionNode[] {
  if (!Array.isArray(edge.children)) return [];

  return edge.children.filter(isPositionNode);
}

function solutionChoice(node?: SolutionPositionNode): "any" | "all" | undefined {
  return node?.choice === "any" || node?.choice === "all" ? node.choice : undefined;
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
      solutionChoice: solutionChoice(childNodes[0]),
    },
  ];
}

export function normalizeSolutionTree(initialFen: string, solution: SolutionDocument): MoveTreeNode {
  const root = isPositionNode(solution.root) ? solution.root : undefined;

  return {
    id: "root",
    fen: initialFen,
    children: root ? normalizePositionNode(root, initialFen, 1) : [],
    solutionChoice: solutionChoice(root),
  };
}

function countMoves(node: MoveTreeNode): number {
  return node.children.reduce((total, child) => total + 1 + countMoves(child), 0);
}

function withoutRevealedMoves(node: MoveTreeNode): MoveTreeNode {
  return {
    ...node,
    children: node.children
      .filter(child => child.review !== "solution-missing" && child.review !== "solution-alternative")
      .map(withoutRevealedMoves),
  };
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

function acceptsAnyMove(node: MoveTreeNode, solverColor: Color): boolean {
  return node.solutionChoice ? node.solutionChoice === "any" : node.children[0]?.move?.color === solverColor;
}

function mergeReviewNode(userNode: MoveTreeNode, solutionNode: MoveTreeNode, solverColor: Color): MoveTreeNode {
  const solutionChildren = childByUci(solutionNode);
  const usedSolutionMoves = new Set<string>();

  const userChildren = userNode.children.map(userChild => {
    const uci = userChild.move?.uci;
    const solutionChild = uci ? solutionChildren.get(uci) : undefined;

    if (!uci || !solutionChild) {
      return markBranch(userChild, "user-extra");
    }

    usedSolutionMoves.add(uci);
    return mergeReviewNode(userChild, solutionChild, solverColor);
  });

  const missingSolutionChildren = solutionNode.children
    .filter(solutionChild => solutionChild.move && !usedSolutionMoves.has(solutionChild.move.uci))
    .map(solutionChild => markBranch(solutionChild,
      acceptsAnyMove(solutionNode, solverColor) && usedSolutionMoves.size > 0 ? "solution-alternative" : "solution-missing",
    ));

  return sharedNode(userNode, [...userChildren, ...missingSolutionChildren]);
}

function requiredCoverage(
  userNode: MoveTreeNode | undefined,
  solutionNode: MoveTreeNode,
  solverColor: Color,
): { matching: number; total: number } {
  const userChildren = userNode ? childByUci(userNode) : new Map<string, MoveTreeNode>();
  const branches = solutionNode.children.map(child => {
    const userChild = child.move ? userChildren.get(child.move.uci) : undefined;
    const rest = requiredCoverage(userChild, child, solverColor);
    return { matching: (userChild ? 1 : 0) + rest.matching, total: 1 + rest.total };
  });

  // Fixed solution-derived weights make coverage monotonic as analysis is added.
  // At a choice, use the best branch's fraction and the longest branch's weight.
  if (acceptsAnyMove(solutionNode, solverColor) && branches.length > 0) {
    const total = Math.max(...branches.map(branch => branch.total));
    const fraction = Math.max(...branches.map(branch => branch.matching / branch.total));
    return { matching: fraction * total, total };
  }
  return branches.reduce((result, branch) => ({
    matching: result.matching + branch.matching,
    total: result.total + branch.total,
  }), { matching: 0, total: 0 });
}

export function compareSolutionTree(
  initialFen: string,
  userRoot: MoveTreeNode,
  solution: SolutionDocument,
): SolutionComparisonResult {
  const solutionRoot = normalizeSolutionTree(initialFen, solution);
  if (solutionRoot.children.length === 0) {
    throw new SolutionComparisonError("The saved solution has no moves to score. Add moves and save a solution.");
  }
  // Review-only hints are not part of the submitted analysis on a later attempt.
  userRoot = withoutRevealedMoves(userRoot);
  const matchingMoves = countMatchingMoves(userRoot, solutionRoot);
  const solutionMoveCount = countMoves(solutionRoot);
  const userMoveCount = countMoves(userRoot);
  const solverColor = positionFromFen(initialFen).turn;
  const coverage = requiredCoverage(userRoot, solutionRoot, solverColor);

  return {
    matchingMoves,
    solutionMoveCount,
    userMoveCount,
    score: Math.round((coverage.matching / coverage.total) * 100),
    reviewRoot: mergeReviewNode(userRoot, solutionRoot, solverColor),
  };
}
