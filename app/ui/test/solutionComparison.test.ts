import assert from "node:assert/strict";
import { test } from "node:test";

import { compareSolutionTree, normalizeSolutionTree } from "../src/solutionComparison.ts";
import type { MoveTreeNode } from "../src/gameTree.ts";
import type { SolutionDocument } from "../src/solutionClient.ts";

const initialFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";

type MutableSolutionPosition = {
  choice?: "any" | "all";
  fen?: string;
  turn?: string;
  moves: MutableSolutionMove[];
};

type MutableSolutionMove = {
  uci: string;
  children: MutableSolutionPosition[];
};

function solutionDoc(lines: string[][]): SolutionDocument & { root: MutableSolutionPosition } {
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

  assert.equal(result.score, 100);
  assert.equal(result.matchingMoves, 2);
  assert.equal(reviewCount(result.reviewRoot, "solution-missing"), 0);
  assert.equal(reviewCount(result.reviewRoot, "user-extra"), 0);
});

test("missing solution line inserts blue branch and score drops", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3"]]), solutionDoc([["f4d3", "e1e2"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const missing = childByUci(shared, "e1e2");

  assert.equal(result.score, 50);
  assert.equal(shared.review, undefined);
  assert.equal(missing.review, "solution-missing");
});

test("extra continuation is retained without a score penalty", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), solutionDoc([["f4d3"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const extra = childByUci(shared, "e1e2");

  assert.equal(result.score, 100);
  assert.equal(shared.review, undefined);
  assert.equal(extra.review, "user-extra");
});

test("wrong continuation loses required coverage and inserts the missing correct move", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e3"]]), solutionDoc([["f4d3", "e1e2"]]));
  const shared = childByUci(result.reviewRoot, "f4d3");
  const extra = childByUci(shared, "e1e3");
  const missing = childByUci(shared, "e1e2");

  assert.equal(result.score, 50);
  assert.equal(shared.review, undefined);
  assert.equal(extra.review, "user-extra");
  assert.equal(missing.review, "solution-missing");
});

test("extra siblings cannot lower full coverage", () => {
  const solution = solutionDoc([["f4d3", "e1e2"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"], ["f4e2"]]), solution);
  assert.equal(result.score, 100);
});

test("one accepted solver alternative gives full credit without requiring the other", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4e2"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4e2"]]), solution);
  assert.equal(result.score, 100);
  assert.equal(childByUci(result.reviewRoot, "f4d3").review, "solution-alternative");
});

test("every required opponent resource contributes to coverage", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4d3", "e1e3"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), solution);
  assert.equal(result.score, 67);
});

test("short shared prefixes earn only their share of required moves", () => {
  const solution = solutionDoc([["f4d3", "e1e2", "d3e1"]]);
  const result = compareSolutionTree(initialFen, userTree([["f4d3"]]), solution);
  assert.equal(result.score, 33);
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
  assert.ok(after.score >= before.score);
});

test("review hints cannot earn free credit on repeat submissions", () => {
  const solution = solutionDoc([["f4d3", "e1e2"], ["f4e2"]]);
  const first = compareSolutionTree(initialFen, userTree([["f4d3"]]), solution);
  const second = compareSolutionTree(initialFen, first.reviewRoot, solution);
  const third = compareSolutionTree(initialFen, second.reviewRoot, solution);
  assert.equal(first.score, 50);
  assert.equal(second.score, 50);
  assert.equal(third.score, 50);
  assert.equal(second.userMoveCount, 1);
});

test("an empty saved solution cannot produce a passing score", () => {
  assert.throws(() => compareSolutionTree(initialFen, userTree([]), solutionDoc([])), /no moves to score/);
});

test("completely different first move gives 0%", () => {
  const result = compareSolutionTree(initialFen, userTree([["f4e2"]]), solutionDoc([["f4d3"]]));

  assert.equal(result.score, 0);
  assert.equal(childByUci(result.reviewRoot, "f4e2").review, "user-extra");
  assert.equal(childByUci(result.reviewRoot, "f4d3").review, "solution-missing");
});

test("a four-move critical line gives prefix credit, without deductions for extra analysis", () => {
  const required = ["f4d3", "e1e2", "d3c1", "a2b1"];
  const solution = solutionDoc([required]);
  for (let length = 0; length <= required.length; length++) {
    const entered = required.slice(0, length);
    const result = compareSolutionTree(initialFen, userTree([entered, ["f4e2"]]), solution);
    assert.equal(result.score, length * 25);
  }

  const missing = userTree([required.slice(0, 2)]);
  const wrong = userTree([["f4d3", "e1e2", "d3e1", "a2b1"], ["f4e2"]]);
  assert.equal(compareSolutionTree(initialFen, missing, solution).score, 50);
  assert.equal(compareSolutionTree(initialFen, wrong, solution).score, 50);
});

test("explicit required and alternative choices override whose turn it is", () => {
  const required = solutionDoc([["f4d3", "e1e2"], ["f4e2"]]);
  required.root.choice = "all";
  assert.equal(compareSolutionTree(initialFen, userTree([["f4e2"]]), required).score, 33);
  assert.equal(compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"], ["f4e2"]]), required).score, 100);

  const alternatives = solutionDoc([["f4d3", "e1e2"], ["f4d3", "e1e3"]]);
  alternatives.root.moves[0].children[0].choice = "any";
  assert.equal(compareSolutionTree(initialFen, userTree([["f4d3", "e1e2"]]), alternatives).score, 100);
});
