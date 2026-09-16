import { expect, test } from "@playwright/test";

import { compareSolutionTree, normalizeSolutionTree } from "../src/solutionComparison";
import type { MoveTreeNode } from "../src/gameTree";
import type { SolutionDocument } from "../src/solutionClient";

const initialFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";

type MutableSolutionPosition = {
  fen?: string;
  turn?: string;
  moves: MutableSolutionMove[];
};

type MutableSolutionMove = {
  uci: string;
  children: MutableSolutionPosition[];
};

function solutionDoc(lines: string[][]): SolutionDocument {
  const root: MutableSolutionPosition = {
    fen: initialFen,
    turn: "b",
    moves: [],
  };

  for (const line of lines) {
    let position = root;

    for (const uci of line) {
      let move = position.moves.find(candidate => candidate.uci === uci);

      if (!move) {
        move = {
          uci,
          children: [{ moves: [] }],
        };
        position.moves.push(move);
      }

      position = move.children[0];
    }
  }

  return {
    fen: initialFen,
    sideToSolve: "b",
    status: "solved",
    root,
  };
}

function userTree(lines: string[][]): MoveTreeNode {
  return normalizeSolutionTree(initialFen, solutionDoc(lines));
}

function childByUci(node: MoveTreeNode, uci: string): MoveTreeNode {
  const child = node.children.find(candidate => candidate.move?.uci === uci);
  if (!child) throw new Error(`Missing child ${uci}`);
  return child;
}

function reviewCount(node: MoveTreeNode, review: "solution-missing" | "user-extra"): number {
  return node.children.reduce(
    (total, child) => total + (child.review === review ? 1 : 0) + reviewCount(child, review),
    0,
  );
}

test("exact tree match gives 100% and no colored nodes", () => {
  const solution = solutionDoc([["f4d3", "e1e2"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), solution);

  expect(result.score).toBe(100);
  expect(result.matchingMoves).toBe(2);
  expect(reviewCount(result.reviewRoot, "solution-missing")).toBe(0);
  expect(reviewCount(result.reviewRoot, "user-extra")).toBe(0);
});

test("missing solution line inserts blue branch and score drops", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3"]]), solutionDoc([["f4d3", "e1e2"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const missing = childByUci(shared, "e1e2");

  expect(result.score).toBe(50);
  expect(shared.review).toBeUndefined();
  expect(missing.review).toBe("solution-missing");
});

test("extra continuation is retained without a score penalty", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), solutionDoc([["f4d3"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const extra = childByUci(shared, "e1e2");

  expect(result.score).toBe(100);
  expect(shared.review).toBeUndefined();
  expect(extra.review).toBe("user-extra");
});

test("wrong continuation loses required coverage and inserts the missing correct move", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e3"]]), solutionDoc([["f4d3", "e1e2"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const extra = childByUci(shared, "e1e3");
  const missing = childByUci(shared, "e1e2");

  expect(result.score).toBe(50);
  expect(shared.review).toBeUndefined();
  expect(extra.review).toBe("user-extra");
  expect(missing.review).toBe("solution-missing");
});

test("extra siblings cannot lower full coverage", () => {
  const solution = solutionDoc([["f4d3", "e1e2"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"], ["f4e2"]]), solution);
  expect(result.score).toBe(100);
});

test("one accepted solver alternative gives full credit without requiring the other", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4e2"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4e2"]]), solution);
  expect(result.score).toBe(100);
  expect(childByUci(result.reviewRoot, "f4d3").review).toBe("solution-alternative");
});

test("every required opponent resource contributes to coverage", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4d3", "e1e3"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), solution);
  expect(result.score).toBe(67);
});

test("short shared prefixes earn only their share of required moves", () => {
  const solution = solutionDoc([["f4d3", "e1e2", "d3e1"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3"]]), solution);
  expect(result.score).toBe(33);
});

test("adding a longer accepted variation cannot lower coverage across other defenses", () => {
  const solution = solutionDoc([
    ["f4d3", "e1e2", "d3c1", "a2b1"],
    ["f4d3", "e1e2", "d3e1", "a2b1", "e1d3", "b1a2", "d3e1"],
    ["f4d3", "e1e3", "d3c1"],
  ]);
  const lines = [["f4d3", "e1e2", "d3c1"], ["f4d3", "e1e3", "d3c1"]];
  const before = compareSolutionTree(initialFen, userTree(lines), solution);
  const after = compareSolutionTree(initialFen,
    userTree([...lines, ["f4d3", "e1e2", "d3e1", "a2b1", "e1d3"]]), solution);
  expect(after.score).toBeGreaterThanOrEqual(before.score);
});

test("review hints cannot earn free credit on repeat submissions", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4e2"]]);
  const first = compareSolutionTree(initialFen, userTree([["f4d3"]]), solution);
  const second = compareSolutionTree(initialFen, first.reviewRoot, solution);
  const third = compareSolutionTree(initialFen, second.reviewRoot, solution);
  expect(first.score).toBe(50);
  expect(second.score).toBe(50);
  expect(third.score).toBe(50);
  expect(second.userMoveCount).toBe(1);
});

test("an empty saved solution cannot produce a passing score", () => {
  expect(() => compareSolutionTree(initialFen, userTree([]), solutionDoc([]))).toThrow(/no moves to score/);
});

test("completely different first move gives 0%", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4e2"]]), solutionDoc([["f4d3"]]));

  expect(result.score).toBe(0);
  expect(childByUci(result.reviewRoot, "f4e2").review).toBe("user-extra");
  expect(childByUci(result.reviewRoot, "f4d3").review).toBe("solution-missing");
});
