import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess, fen } from "chessops";
import { describePosition, positionAnnouncement } from "../src/boardAccessibility.ts";

test("board description includes each occupied square and castling rights", () => {
  const description = describePosition("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.match(description, /White to move/);
  assert.match(description, /White: rook a1, king e1, rook h1/);
  assert.match(description, /Black: rook a8, king e8, rook h8/);
  for (const right of ["White kingside", "White queenside", "Black kingside", "Black queenside"]) {
    assert.ok(description.includes(right));
  }
});

test("board description includes en passant and absent castling rights", () => {
  const description = describePosition("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  assert.match(description, /Castling rights: none/);
  assert.match(description, /En passant target: d6/);
});

test("position announcements distinguish check, checkmate, stalemate, and material draws", () => {
  const examples = [
    ["4k3/8/8/8/8/8/4R3/4K3 b - - 0 1", "Black to move. Check."],
    ["7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", "Checkmate. White wins."],
    ["7k/5K2/6Q1/8/8/8/8/8 b - - 0 1", "Stalemate. Draw."],
    ["7k/8/8/8/8/8/8/K7 w - - 0 1", "Draw by insufficient material."],
  ];
  for (const [source, expected] of examples) {
    const position = Chess.fromSetup(fen.parseFen(source).unwrap()).unwrap();
    assert.equal(positionAnnouncement(position), expected);
  }
});
