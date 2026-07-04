import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chess,
  compat,
  fen as chessFen,
  isNormal,
  makeSquare,
  parseSquare,
  parseUci,
  squareRank,
  type Move,
  type Square,
} from "chessops";
import type { Dests, Key } from "@lichess-org/chessground/types";

import "./App.css";
import { ChessBoard } from "./components/ChessBoard";
import { bestMove as stockfishBestMove, dispose as disposeStockfish } from "./engine/stockfishClient";

const initialFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const engineDepth = 8;
const emptyDests = new Map() as Dests;

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
  const [engineThinking, setEngineThinking] = useState(false);
  const [engineError, setEngineError] = useState<string>();
  const currentFenRef = useRef(currentFen);

  const humanColor = useMemo(() => positionFromFen(initialFen).turn, []);
  const position = useMemo(() => positionFromFen(currentFen), [currentFen]);
  const canHumanMove = position.turn === humanColor && !engineThinking && !position.isEnd();
  const movableDests = useMemo(
    () => (canHumanMove ? (compat.chessgroundDests(position) as Dests) : emptyDests),
    [canHumanMove, position],
  );

  useEffect(() => {
    currentFenRef.current = currentFen;
  }, [currentFen]);

  useEffect(() => disposeStockfish, []);

  const playEngineMove = useCallback(async (fenAfterHumanMove: string) => {
    setEngineThinking(true);
    setEngineError(undefined);

    try {
      const uci = await stockfishBestMove(fenAfterHumanMove, engineDepth);
      if (currentFenRef.current !== fenAfterHumanMove) return;

      const enginePosition = positionFromFen(fenAfterHumanMove);
      const move = parseUci(uci);

      if (!move || !isNormal(move) || !enginePosition.isLegal(move)) {
        throw new Error(`Stockfish returned an illegal move: ${uci}`);
      }

      enginePosition.play(move);

      setCurrentFen(chessFen.makeFen(enginePosition.toSetup()));
      setLastMove([makeSquare(move.from), makeSquare(move.to)] as Key[]);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : "Stockfish failed to move.");
    } finally {
      setEngineThinking(false);
    }
  }, []);

  const handleMove = useCallback(
    (orig: Key, dest: Key) => {
      if (!canHumanMove) return;

      const from = parseSquare(orig);
      const to = parseSquare(dest);

      if (from === undefined || to === undefined) return;

      const move: Move = { from, to };
      if (isPromotion(position, from, to)) move.promotion = "queen";
      if (!position.isLegal(move)) return;

      const nextPosition = position.clone();
      nextPosition.play(move);

      const nextFen = chessFen.makeFen(nextPosition.toSetup());
      setCurrentFen(nextFen);
      setLastMove([orig, dest]);

      if (!nextPosition.isEnd()) void playEngineMove(nextFen);
    },
    [canHumanMove, playEngineMove, position],
  );

  const statusText = engineError
    ? engineError
    : position.isEnd()
      ? "Game over"
      : engineThinking
        ? "Engine thinking"
        : position.turn === humanColor
          ? "Your move"
          : "Engine to move";

  return (
    <main className="app-shell">
      <section className="board-stage" aria-labelledby="position-title">
        <div className="position-header">
          <h1 id="position-title">Woodpecker</h1>
          <p>{statusText}</p>
        </div>
        <ChessBoard
          fen={currentFen}
          orientation={humanColor}
          turnColor={position.turn}
          movableColor={canHumanMove ? humanColor : undefined}
          movableDests={movableDests}
          check={position.isCheck()}
          lastMove={lastMove}
          onMove={handleMove}
        />
      </section>
    </main>
  );
}
