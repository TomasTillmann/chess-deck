import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess, fen, makeUci } from "chessops";
import { resolveBoardMove, type PromotionRole } from "../src/hooks/usePuzzleSolver.ts";

const roles: PromotionRole[] = ["queen", "rook", "bishop", "knight"];
const positions = [
  { fen: "7k/P7/8/8/8/8/8/7K w - - 0 1", from: "a7", to: "a8" },
  { fen: "1r5k/P7/8/8/8/8/8/7K w - - 0 1", from: "a7", to: "b8" },
  { fen: "7k/8/8/8/8/8/p7/7K b - - 0 1", from: "a2", to: "a1" },
  { fen: "7k/8/8/8/8/8/p7/1R5K b - - 0 1", from: "a2", to: "b1" },
] as const;

test("white and black promotions wait for a piece choice without changing the position", () => {
  for (const entry of positions) {
    const position = Chess.fromSetup(fen.parseFen(entry.fen).unwrap()).unwrap();
    assert.deepEqual(resolveBoardMove(position, entry.from, entry.to), { promotions: roles });
    assert.equal(fen.makeFen(position.toSetup()), entry.fen);
  }
});

test("every promotion piece retains its UCI suffix for straight moves and captures", () => {
  for (const entry of positions) {
    const position = Chess.fromSetup(fen.parseFen(entry.fen).unwrap()).unwrap();
    for (const [index, role] of roles.entries()) {
      const result = resolveBoardMove(position, entry.from, entry.to, role);
      assert.ok(result && "move" in result);
      assert.equal(makeUci(result.move), entry.from + entry.to + "qrbn"[index]);
      assert.equal(fen.makeFen(position.toSetup()), entry.fen);
    }
  }
});

test("illegal moves cannot request promotion and ordinary moves have no promotion", () => {
  const position = Chess.fromSetup(fen.parseFen(positions[0].fen).unwrap()).unwrap();
  assert.equal(resolveBoardMove(position, "a7", "b8"), undefined);
  assert.equal(resolveBoardMove(position, "h1", "h2", "queen"), undefined);
  assert.equal(resolveBoardMove(position, "a7", "a8", "king" as PromotionRole), undefined);
  assert.equal(resolveBoardMove(position, "a7", "a8", "invalid" as PromotionRole), undefined);
  const result = resolveBoardMove(position, "h1", "h2");
  assert.ok(result && "move" in result);
  assert.equal(makeUci(result.move), "h1h2");
});
