import { isNormal, kingCastlesTo, type Chess, type Move } from "chessops";
import { castlingSide } from "chessops/chess";

export function canonicalMove(position: Chess, move: Move): Move {
  const side = castlingSide(position, move);
  return side && isNormal(move) ? { ...move, to: kingCastlesTo(position.turn, side) } : move;
}
