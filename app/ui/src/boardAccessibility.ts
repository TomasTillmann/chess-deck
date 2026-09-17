import { Chess, fen as chessFen, makeSquare } from "chessops";

const colorNames = { white: "White", black: "Black" } as const;

export function positionAnnouncement(position: Chess): string {
  if (position.isCheckmate()) return `Checkmate. ${colorNames[position.turn === "white" ? "black" : "white"]} wins.`;
  if (position.isStalemate()) return "Stalemate. Draw.";
  if (position.isInsufficientMaterial()) return "Draw by insufficient material.";
  return `${colorNames[position.turn]} to move.${position.isCheck() ? " Check." : ""}`;
}

export function describePosition(fen: string): string {
  const position = Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
  const pieces = [...position.board];
  const descriptions = [positionAnnouncement(position)];
  const rights: string[] = [];
  for (const color of ["white", "black"] as const) {
    descriptions.push(`${colorNames[color]}: ${pieces.filter(([, piece]) => piece.color === color)
      .map(([square, piece]) => `${piece.role} ${makeSquare(square)}`).join(", ")}.`);
    if (position.castles.rook[color].h !== undefined) rights.push(`${colorNames[color]} kingside`);
    if (position.castles.rook[color].a !== undefined) rights.push(`${colorNames[color]} queenside`);
  }
  descriptions.push(`Castling rights: ${rights.join(", ") || "none"}.`);
  if (position.epSquare !== undefined) descriptions.push(`En passant target: ${makeSquare(position.epSquare)}.`);
  return descriptions.join(" ");
}
