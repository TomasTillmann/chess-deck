import { createElement, type CSSProperties } from "react";
import type { ThemeProps } from "../design-system";

import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type PreviewPiece = {
  color: "black" | "white";
  file: number;
  rank: number;
  role: "bishop" | "king" | "knight" | "pawn" | "queen" | "rook";
};

const pieceRoles: Record<string, PreviewPiece["role"]> = {
  b: "bishop",
  k: "king",
  n: "knight",
  p: "pawn",
  q: "queen",
  r: "rook",
};

function fenPieces(fen: string): PreviewPiece[] {
  const placement = fen.split(" ")[0];
  const pieces: PreviewPiece[] = [];
  let file = 0;
  let rank = 0;

  for (const character of placement) {
    if (character === "/") {
      file = 0;
      rank += 1;
      continue;
    }

    const emptySquares = Number(character);
    if (Number.isInteger(emptySquares) && emptySquares > 0) {
      file += emptySquares;
      continue;
    }

    const role = pieceRoles[character.toLowerCase()];
    if (!role || file > 7 || rank > 7) continue;

    pieces.push({
      color: character === character.toUpperCase() ? "white" : "black",
      file,
      rank,
      role,
    });
    file += 1;
  }

  return pieces;
}

type FenPreviewProps = ThemeProps & {
  fen: string;
};

export function FenPreview({ fen, theme }: FenPreviewProps) {
  const pieces = fenPieces(fen);

  return (
    <div className="fen-preview cg-wrap" data-theme={theme} aria-hidden="true">
      {createElement("cg-board")}
      {pieces.map(piece =>
        createElement("piece", {
          className: `${piece.role} ${piece.color}`,
          key: `${piece.file}-${piece.rank}-${piece.role}-${piece.color}`,
          style: {
            transform: `translate(${piece.file * 100}%, ${piece.rank * 100}%)`,
          } satisfies CSSProperties,
        }),
      )}
    </div>
  );
}
