import { useEffect, useMemo, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api as ChessgroundApi } from "@lichess-org/chessground/api";
import type { Config as ChessgroundConfig } from "@lichess-org/chessground/config";
import type { Color, FEN, Key } from "@lichess-org/chessground/types";

import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type ChessBoardProps = {
  fen: FEN;
  orientation?: Color;
  lastMove?: Key[];
};

export function ChessBoard({ fen, orientation = "white", lastMove }: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const groundRef = useRef<ChessgroundApi | null>(null);

  const config = useMemo<ChessgroundConfig>(
    () => ({
      fen,
      orientation,
      lastMove,
      coordinates: true,
      viewOnly: true,
      draggable: {
        enabled: false,
      },
      selectable: {
        enabled: false,
      },
      movable: {
        free: false,
      },
      drawable: {
        enabled: true,
        visible: true,
      },
    }),
    [fen, lastMove, orientation],
  );

  useEffect(() => {
    if (!boardRef.current) return;

    const ground = Chessground(boardRef.current, config);
    groundRef.current = ground;

    return () => {
      ground.destroy();
      groundRef.current = null;
    };
  }, []);

  useEffect(() => {
    groundRef.current?.set(config);
  }, [config]);

  return <div ref={boardRef} className="chess-board" aria-label="Chess position" />;
}
