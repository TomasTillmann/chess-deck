import { ChessBoard } from "../components/ChessBoard";
import { MoveNotationPanel } from "../components/MoveNotationPanel";
import { ReviewPanel } from "../components/ReviewPanel";
import type { Deck } from "../decks";
import { Button, Icon, StatusMessage, type ThemeProps } from "../design-system";
import { usePuzzleSolver } from "../hooks/usePuzzleSolver";

const reviewReasonLabels: Record<string, string> = {
  max_seconds: "Analysis time limit reached",
  max_depth: "Line needs deeper analysis",
  max_nodes: "More branches need analysis",
  candidate_limit: "Additional moves need checking",
  forcing_candidate_limit: "Additional forcing defenses need checking",
  ambiguous_root: "Several first moves appear equivalent",
  repetition_unresolved: "Repeating line needs review",
  empty_root: "No solution moves were found",
  analysis_unavailable: "Engine analysis was unavailable",
  checking_defense_analysis_unavailable: "A checking defense still needs analysis",
  root_mate_unconfirmed: "The mating line could not be confirmed",
  losing_root: "The starting position appears lost",
  solver_mated: "A line ends with the solving side checkmated",
  winning_line_drawn: "A winning line ends in a draw",
};

type SolverPageProps = ThemeProps & {
  deck: Deck;
  positionIndex: number;
  onGoToDeck: () => void;
  onGoToPosition: (positionIndex: number, preserveScroll?: boolean) => void;
};

export function SolverPage({ deck, positionIndex, onGoToDeck, onGoToPosition, theme }: SolverPageProps) {
  const {
    initialFen,
    game,
    submitState,
    updateState,
    canUpdateSolution,
    solutionReviewReasons,
    currentFen,
    lastMove,
    boardOrientation,
    position,
    canMove,
    movableDests,
    goToPath,
    movePathUp,
    movePathDown,
    deleteMoveTreeAtPath,
    handleMove,
    handleSubmit,
    handleUpdateSolution,
  } = usePuzzleSolver(deck, positionIndex);
  const previousPositionIndex = positionIndex - 1;
  const nextPositionIndex = positionIndex + 1;

  return (
    <main className="app-shell solver-shell" data-theme={theme}>
      <div className="solver-view">
        <div className="position-nav">
          <Button variant="ghost" className="deck-back-button" type="button" onClick={onGoToDeck}>
            <Icon name="arrow-left" />
            Go to deck
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="position-arrow-button"
            type="button"
            aria-label="Previous position"
            title="Previous position"
            disabled={previousPositionIndex < 0}
            onClick={() => onGoToPosition(previousPositionIndex)}
          >
            <Icon name="chevron-left" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="position-arrow-button"
            type="button"
            aria-label="Next position"
            title="Next position"
            disabled={nextPositionIndex >= deck.fens.length}
            onClick={() => onGoToPosition(nextPositionIndex)}
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
        <div className="play-layout">
          <section className="board-stage" aria-labelledby="position-title">
            <div className="position-header">
              <h1 id="position-title">
                {deck.name} - {positionIndex + 1}
              </h1>
            </div>
            <ChessBoard
              fen={currentFen}
              orientation={boardOrientation}
              turnColor={position.turn}
              movableColor={canMove ? position.turn : undefined}
              movableDests={movableDests}
              check={position.isCheck()}
              lastMove={lastMove}
              onMove={handleMove}
            />
            <div className="solution-submit-row">
              <Button
                variant="primary"
                className="solution-submit-button"
                type="button"
                onClick={handleSubmit}
                disabled={submitState.status === "loading" || submitState.status === "success"}
              >
                Submit
              </Button>
              <ReviewPanel
                deck={deck}
                fen={initialFen}
                revealed={submitState.status === "success"}
                onGoToPosition={index => onGoToPosition(index, true)}
              />
            </div>
            <div className="solution-result-row">
              {canUpdateSolution ? (
                <Button
                  className="solution-update-button"
                  type="button"
                  onClick={handleUpdateSolution}
                  disabled={submitState.status === "loading" || updateState.status === "loading" || game.root.children.length === 0}
                >
                  {updateState.status === "loading" ? "Saving…" : "Save solution"}
                </Button>
              ) : null}
              {solutionReviewReasons ? (
                <StatusMessage className="solution-status is-provisional" tone="warning" role="status">
                  Provisional solution — engine analysis needs review.
                </StatusMessage>
              ) : null}
              {submitState.status === "success" ? (
                <StatusMessage className="solution-score" tone="success" aria-live="polite">
                  {submitState.score}% coverage{solutionReviewReasons ? " (provisional)" : ""}
                </StatusMessage>
              ) : null}
              {submitState.status === "error" ? (
                <StatusMessage className="solution-status" tone="danger" role="status">
                  {submitState.message}
                </StatusMessage>
              ) : null}
              {updateState.status === "success" ? (
                <StatusMessage className="solution-status is-success" tone="success" role="status">
                  Solution saved
                </StatusMessage>
              ) : null}
              {updateState.status === "error" ? (
                <StatusMessage className="solution-status" tone="danger" role="status">
                  {updateState.message}
                </StatusMessage>
              ) : null}
            </div>
            {solutionReviewReasons && solutionReviewReasons.length > 0 ? (
              <details className="solution-guidance">
                <summary>Why this solution needs review</summary>
                <ul>{solutionReviewReasons.map((reason, index) => <li key={index}>{reviewReasonLabels[reason] ?? reason.replace(/_/g, " ")}</li>)}</ul>
              </details>
            ) : null}
          </section>
          <MoveNotationPanel
            root={game.root}
            currentPath={game.currentPath}
            onSelectPath={goToPath}
            onDeletePath={deleteMoveTreeAtPath}
            onMovePathUp={movePathUp}
            onMovePathDown={movePathDown}
          />
        </div>
      </div>
    </main>
  );
}
