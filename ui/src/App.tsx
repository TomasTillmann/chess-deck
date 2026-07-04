import { useCallback, useMemo, useState } from "react";
import {
  Chess,
  compat,
  fen as chessFen,
  parseSquare,
  squareRank,
  type Move,
  type Square,
} from "chessops";
import type { Dests, Key } from "@lichess-org/chessground/types";

import "./App.css";
import { ChessBoard } from "./components/ChessBoard";

const initialFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function isPromotion(position: Chess, from: Square, to: Square): boolean {
  const piece = position.board.get(from);

  return piece?.role === "pawn" && (squareRank(to) === 0 || squareRank(to) === 7);
}

export function App() {
  const [currentFen, setCurrentFen] = useState(initialFen);
  const [lastMove, setLastMove] = useState<Key[]>();

  const position = useMemo(() => positionFromFen(currentFen), [currentFen]);
  const movableDests = useMemo(() => compat.chessgroundDests(position) as Dests, [position]);

  const handleMove = useCallback(
    (orig: Key, dest: Key) => {
      const from = parseSquare(orig);
      const to = parseSquare(dest);

      if (from === undefined || to === undefined) return;

      const move: Move = { from, to };
      if (isPromotion(position, from, to)) move.promotion = "queen";
      if (!position.isLegal(move)) return;

      const nextPosition = position.clone();
      nextPosition.play(move);

      setCurrentFen(chessFen.makeFen(nextPosition.toSetup()));
      setLastMove([orig, dest]);
    },
    [position],
  );

  return (
    <main className="app-shell">
      <section className="board-stage" aria-labelledby="position-title">
        <div className="position-header">
          <h1 id="position-title">Woodpecker</h1>
          <p>{position.turn === "white" ? "White" : "Black"} to move</p>
        </div>
        <ChessBoard
          fen={currentFen}
          orientation={position.turn}
          turnColor={position.turn}
          movableDests={movableDests}
          check={position.isCheck()}
          lastMove={lastMove}
          onMove={handleMove}
        />
      </section>
    </main>
  );
}
