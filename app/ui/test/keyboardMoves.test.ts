import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess, fen } from "chessops";
import { parseKeyboardMove, resolveBoardMove } from "../src/hooks/usePuzzleSolver.ts";

function position(source = fen.INITIAL_FEN): Chess {
  return Chess.fromSetup(fen.parseFen(source).unwrap()).unwrap();
}

test("keyboard moves accept SAN and UCI without mutating the position", () => {
  const board = position();
  assert.deepEqual(parseKeyboardMove(board, "  e2e4  "), { orig: "e2", dest: "e4", promotion: undefined });
  assert.deepEqual(parseKeyboardMove(board, "Nf3"), { orig: "g1", dest: "f3", promotion: undefined });
  assert.equal(fen.makeFen(board.toSetup()), fen.INITIAL_FEN);
});

test("keyboard moves reject malformed, illegal, pinned, and ambiguous moves", () => {
  for (const input of ["", "hello", "e2e5", "e7e5", "P@e4", "e2e4q"]) {
    assert.equal(parseKeyboardMove(position(), input), undefined, input);
  }
  assert.equal(parseKeyboardMove(position("k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1"), "e2d2"), undefined);
  const ambiguous = position("4k3/8/8/8/8/2N1N3/8/4K3 w - - 0 1");
  assert.equal(parseKeyboardMove(ambiguous, "Nd5"), undefined);
  assert.deepEqual(parseKeyboardMove(ambiguous, "Ncd5"), { orig: "c3", dest: "d5", promotion: undefined });
});

test("bishop SAN rank disambiguation is not mistaken for a b-file coordinate move", () => {
  const board = position("8/7k/8/8/8/2B5/8/KNB5 w - - 0 1");
  assert.deepEqual(parseKeyboardMove(board, "B1d2"), { orig: "c1", dest: "d2", promotion: undefined });
  assert.deepEqual(parseKeyboardMove(board, "b1d2"), { orig: "b1", dest: "d2", promotion: undefined });
});

test("keyboard moves support castling and en passant", () => {
  const castling = position("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.deepEqual(parseKeyboardMove(castling, "O-O"), { orig: "e1", dest: "h1", promotion: undefined });
  assert.deepEqual(parseKeyboardMove(castling, "O-O-O"), { orig: "e1", dest: "a1", promotion: undefined });
  assert.deepEqual(parseKeyboardMove(castling, "e1g1"), { orig: "e1", dest: "g1", promotion: undefined });
  assert.deepEqual(parseKeyboardMove(position("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"), "exd6"), { orig: "e5", dest: "d6", promotion: undefined });
});

test("typed promotions use all four roles and share the board promotion chooser", () => {
  const examples = [
    ["7k/4P3/8/8/8/8/8/K7 w - - 0 1", "e7", "e8"],
    ["7k/8/8/8/8/8/4p3/K7 b - - 0 1", "e2", "e1"],
  ];
  for (const [source, orig, dest] of examples) {
    const board = position(source);
    for (const [suffix, role] of [["q", "queen"], ["r", "rook"], ["b", "bishop"], ["n", "knight"]]) {
      const expected = { orig, dest, promotion: role };
      assert.deepEqual(parseKeyboardMove(board, orig + dest + suffix), expected);
      assert.deepEqual(parseKeyboardMove(board, `${dest}=${suffix.toUpperCase()}`), expected);
    }
    const move = parseKeyboardMove(board, orig + dest);
    assert.deepEqual(move, { orig, dest, promotion: undefined });
    assert.ok("promotions" in resolveBoardMove(board, move.orig, move.dest)!);
    assert.equal(parseKeyboardMove(board, orig + dest + "k"), undefined);
    assert.equal(parseKeyboardMove(board, orig + dest + "p"), undefined);
  }
});
