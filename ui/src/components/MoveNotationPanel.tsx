import { useEffect, useRef, type Ref } from "react";
import type { Color } from "chessops";

export type MoveRecord = {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  moveNumber: number;
};

type MovePair = {
  moveNumber: number;
  white?: MoveRecord;
  black?: MoveRecord;
};

type MoveNotationPanelProps = {
  moves: MoveRecord[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
};

function pairMoves(moves: MoveRecord[]): MovePair[] {
  const pairs: MovePair[] = [];

  for (const move of moves) {
    let pair = pairs.find(item => item.moveNumber === move.moveNumber);
    if (!pair) {
      pair = { moveNumber: move.moveNumber };
      pairs.push(pair);
    }

    if (move.color === "white") pair.white = move;
    else pair.black = move;
  }

  return pairs;
}

function MoveButton({
  move,
  currentPly,
  onSelectPly,
  currentRef,
}: {
  move?: MoveRecord;
  currentPly: number;
  onSelectPly: (ply: number) => void;
  currentRef?: Ref<HTMLButtonElement>;
}) {
  if (!move) return <span className="notation-empty">...</span>;

  return (
    <button
      ref={move.ply === currentPly ? currentRef : undefined}
      type="button"
      className={move.ply === currentPly ? "notation-move is-current" : "notation-move"}
      onClick={() => onSelectPly(move.ply)}
      aria-current={move.ply === currentPly ? "step" : undefined}
    >
      {move.san}
    </button>
  );
}

export function MoveNotationPanel({ moves, currentPly, onSelectPly }: MoveNotationPanelProps) {
  const currentMoveRef = useRef<HTMLButtonElement | null>(null);
  const pairs = pairMoves(moves);
  const lastPly = moves.length;

  useEffect(() => {
    currentMoveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPly, moves.length]);

  return (
    <aside className="notation-panel" aria-label="Move notation">
      <div className="notation-moves" role="list">
        {pairs.length === 0 ? (
          <p className="notation-placeholder">No moves yet</p>
        ) : (
          pairs.map(pair => (
            <div className="notation-row" role="listitem" key={pair.moveNumber}>
              <span className="notation-index">{pair.moveNumber}</span>
              <MoveButton
                move={pair.white}
                currentPly={currentPly}
                onSelectPly={onSelectPly}
                currentRef={currentMoveRef}
              />
              <MoveButton
                move={pair.black}
                currentPly={currentPly}
                onSelectPly={onSelectPly}
                currentRef={currentMoveRef}
              />
            </div>
          ))
        )}
      </div>
      <div className="notation-controls" aria-label="Move navigation">
        <button type="button" onClick={() => onSelectPly(0)} disabled={currentPly === 0} aria-label="First move">
          |&lt;
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(currentPly - 1)}
          disabled={currentPly === 0}
          aria-label="Previous move"
        >
          &lt;
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(currentPly + 1)}
          disabled={currentPly === lastPly}
          aria-label="Next move"
        >
          &gt;
        </button>
        <button
          type="button"
          onClick={() => onSelectPly(lastPly)}
          disabled={currentPly === lastPly}
          aria-label="Last move"
        >
          &gt;|
        </button>
      </div>
    </aside>
  );
}
