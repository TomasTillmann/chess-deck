import { useEffect, useMemo, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api as ChessgroundApi } from "@lichess-org/chessground/api";
import type { Config as ChessgroundConfig } from "@lichess-org/chessground/config";
import type { Color, Dests, FEN, Key } from "@lichess-org/chessground/types";

import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type ChessBoardProps = {
  fen: FEN;
  orientation: Color;
  turnColor: Color;
  movableDests: Dests;
  check: boolean;
  lastMove?: Key[];
  onMove: (orig: Key, dest: Key) => void;
};

export function ChessBoard({
  fen,
  orientation,
  turnColor,
  movableDests,
  check,
  lastMove,
  onMove,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const groundRef = useRef<ChessgroundApi | null>(null);

  const config = useMemo<ChessgroundConfig>(
    () => ({
      fen,
      orientation,
      turnColor,
      check,
      lastMove,
      coordinates: true,
      viewOnly: false,
      draggable: {
        enabled: true,
      },
      selectable: {
        enabled: true,
      },
      movable: {
        free: false,
        color: turnColor,
        dests: movableDests,
        showDests: true,
        events: {
          after: onMove,
        },
      },
      premovable: {
        enabled: false,
      },
      drawable: {
        enabled: true,
        visible: true,
      },
    }),
    [check, fen, lastMove, movableDests, onMove, orientation, turnColor],
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
