import { Chess, fen as chessFen, makeUci, squareRank, type Move, type Square } from "chessops";

import type { Engine } from "./types";

type LegalMoveEngineOptions = {
  delayMs?: number;
};

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function isPromotion(position: Chess, from: Square, to: Square): boolean {
  const piece = position.board.get(from);

  return piece?.role === "pawn" && (squareRank(to) === 0 || squareRank(to) === 7);
}

function legalMoves(position: Chess): Move[] {
  const moves: Move[] = [];

  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const move: Move = { from, to };
      if (isPromotion(position, from, to)) move.promotion = "queen";
      moves.push(move);
    }
  }

  return moves;
}

function fenHash(fen: string): number {
  let hash = 0;

  for (let index = 0; index < fen.length; index += 1) {
    hash = Math.imul(hash, 31) + fen.charCodeAt(index);
  }

  return hash >>> 0;
}

function prefersContinuingGame(position: Chess, move: Move): boolean {
  const nextPosition = position.clone();
  nextPosition.play(move);

  return !nextPosition.isEnd();
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, delayMs));
}

export function createLegalMoveEngine({ delayMs = 0 }: LegalMoveEngineOptions = {}): Engine {
  let searchCount = 0;

  return {
    prepare: () => Promise.resolve(),

    async bestMove(fen: string): Promise<string> {
      if (delayMs > 0) await wait(delayMs);

      const position = positionFromFen(fen);
      const moves = legalMoves(position);
      const preferredMoves = moves.filter(move => prefersContinuingGame(position, move));
      const candidates = preferredMoves.length > 0 ? preferredMoves : moves;

      if (candidates.length === 0) throw new Error("Legal move engine did not find a legal move.");

      const move = candidates[(fenHash(fen) + searchCount) % candidates.length];
      searchCount += 1;

      return makeUci(move);
    },

    dispose: () => undefined,
  };
}
