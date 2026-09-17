import { useId, useLayoutEffect, useRef } from "react";
import { Button, type ThemeProps } from "../design-system";
import type { PromotionRole } from "../hooks/usePuzzleSolver";

type PromotionChoiceProps = ThemeProps & {
  destination: string;
  choices: PromotionRole[];
  onChoose: (role: PromotionRole) => void;
  onCancel: () => void;
};
const labels: Record<PromotionRole, string> = { queen: "Queen", rook: "Rook", bishop: "Bishop", knight: "Knight" };

export function PromotionChoice({ destination, choices, onChoose, onCancel, theme }: PromotionChoiceProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Close before DOM removal so the browser can restore focus to the opener.
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="view-dialog" data-theme={theme} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => {
    event.preventDefault();
    onCancel();
  }}>
    <h2 id={titleId}>Promote pawn</h2>
    <p id={descriptionId}>Choose a piece for {destination}.</p>
    <div className="promotion-options">
      {choices.map(role => <Button key={role} onClick={() => onChoose(role)}>{labels[role]}</Button>)}
    </div>
    <div className="view-dialog-actions"><Button onClick={onCancel}>Cancel</Button></div>
  </dialog>;
}
