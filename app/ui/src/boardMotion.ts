import type { Api as ChessgroundApi } from "@lichess-org/chessground/api";

export function syncBoardMotion(ground: Pick<ChessgroundApi, "set">): () => void {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = () => ground.set({ animation: { enabled: !preference.matches } });
  update();
  preference.addEventListener("change", update);
  return () => preference.removeEventListener("change", update);
}
