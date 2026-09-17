import { useId, type ReactNode } from "react";
import { Button, type ThemeProps } from "../design-system";
import { FenPreview } from "./FenPreview";

export function DeckCard({ fen, label, children, onClick, position = false, recommended = false, theme }: ThemeProps & {
  fen: string;
  label: string;
  children?: ReactNode;
  onClick: () => void;
  position?: boolean;
  recommended?: boolean;
}) {
  const descriptionId = useId();
  return <Button theme={theme} className={`deck-card${position ? " position-card" : ""}${recommended ? " is-recommended" : ""}`} aria-label={position ? label : undefined} aria-describedby={position ? descriptionId : undefined} onClick={onClick}>
    <span className={`deck-card-preview${position ? " position-card-preview" : ""}`}><FenPreview fen={fen} /></span>
    <span className="deck-card-copy">
      <span className={position ? "position-card-label" : "deck-card-name"}>{label}</span>
      <span id={descriptionId} style={{ display: "contents" }}>{children}</span>
    </span>
  </Button>;
}
