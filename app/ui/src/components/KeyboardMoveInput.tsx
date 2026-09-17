import { useEffect, useId, useState } from "react";
import { Button, StatusMessage } from "../design-system";

type KeyboardMoveInputProps = {
  fen: string;
  status: string;
  disabled: boolean;
  onMove: (text: string) => "moved" | "promotion" | "invalid";
};

export function KeyboardMoveInput({ fen, status, disabled, onMove }: KeyboardMoveInputProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setValue("");
    setError(false);
  }, [fen]);

  return (
    <details className="keyboard-move-input">
      <summary>Keyboard moves</summary>
      <form onSubmit={event => {
        event.preventDefault();
        if (disabled) return;
        const result = onMove(value);
        setError(result === "invalid");
        if (result !== "invalid") setValue("");
      }}>
        <label htmlFor={id}>Move</label>
        <div className="keyboard-move-controls">
          <input
            id={id}
            value={value}
            onChange={event => { setValue(event.target.value); setError(false); }}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            aria-invalid={error || undefined}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            maxLength={32}
            disabled={disabled}
          />
          <Button type="submit" disabled={disabled}>Play move</Button>
        </div>
        <p id={`${id}-help`}>Use e2e4 or Nf3. For promotion, use e7e8n or e8=N.</p>
        <p role="status">{status}</p>
        {error ? <StatusMessage id={`${id}-error`} tone="danger" role="alert">That move is not legal here. Enter a legal move in SAN or UCI notation.</StatusMessage> : null}
      </form>
    </details>
  );
}
