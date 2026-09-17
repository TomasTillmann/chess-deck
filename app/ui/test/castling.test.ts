import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess, fen } from "chessops";
import { createMoveRoot } from "../src/gameTree.ts";
import { appendOrSelectMove, parseKeyboardMove, resolveBoardMove } from "../src/hooks/usePuzzleSolver.ts";
import { compareSolutionTree } from "../src/solutionComparison.ts";
import { solutionDocumentFromMoveTree } from "../src/solutionClient.ts";

for (const [turn, rank] of [["w", "1"], ["b", "8"]]) {
  for (const [san, destination, rook] of [["O-O", "g", "h"], ["O-O-O", "c", "a"]]) {
    test(`${turn} ${san} shares one standard UCI identity for entry, scoring, and persistence`, () => {
      const source = `r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1`;
      const position = Chess.fromSetup(fen.parseFen(source).unwrap()).unwrap();
      const standard = `e${rank}${destination}${rank}`;
      const alias = `e${rank}${rook}${rank}`;
      const solution = (uci: string) => ({ root: { moves: [{ uci, children: [] }] } });
      let root = createMoveRoot(source);

      for (const input of [san, standard, alias]) {
        const parsed = parseKeyboardMove(position, input)!;
        const resolved = resolveBoardMove(position, parsed.orig, parsed.dest, parsed.promotion)!;
        assert.ok("move" in resolved);
        root = appendOrSelectMove(root, [], position, resolved.move).root;

        assert.equal(compareSolutionTree(source, root, solution(standard)).score, 100);
        assert.equal(compareSolutionTree(source, root, solution(alias)).score, 100);
        assert.equal(root.children.length, 1, "the same castle must not create duplicate branches");
        assert.equal(root.children[0].move?.uci, standard);
        assert.deepEqual(root.children[0].lastMove, [`e${rank}`, `${destination}${rank}`]);
        assert.equal(solutionDocumentFromMoveTree(source, root).root.moves[0].uci, standard);
      }
    });
  }
}
