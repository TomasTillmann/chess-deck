import { ChessBoard } from "../components/ChessBoard";
import { KeyboardMoveInput } from "../components/KeyboardMoveInput";
import { positionAnnouncement } from "../boardAccessibility";
import { MoveNotationPanel } from "../components/MoveNotationPanel";
import { PromotionChoice } from "../components/PromotionChoice";
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
  navigation?: { previous?: () => void; next?: () => void };
  backLabel?: string;
  practiceLabel?: string;
  onLoadNextReview: () => Promise<void>;
  allowSolutionEditing?: boolean;
};

export function SolverPage({ deck, positionIndex, onGoToDeck, onGoToPosition, navigation, backLabel = "Go to deck", practiceLabel, onLoadNextReview, allowSolutionEditing = true, theme }: SolverPageProps) {
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
    handleKeyboardMove,
    pendingPromotion,
    choosePromotion,
    cancelPromotion,
    handleSubmit,
    handleUpdateSolution,
  } = usePuzzleSolver(deck, positionIndex);
  const previousPositionIndex = positionIndex - 1;
  const nextPositionIndex = positionIndex + 1;
  const previous = navigation ? navigation.previous : previousPositionIndex >= 0 ? () => onGoToPosition(previousPositionIndex) : undefined;
  const next = navigation ? navigation.next : nextPositionIndex < deck.fens.length ? () => onGoToPosition(nextPositionIndex) : undefined;

  return (
    <main className="app-shell solver-shell" data-theme={theme}>
      <div className="solver-view">
        <div className="position-nav">
          <Button variant="ghost" className="deck-back-button" type="button" onClick={onGoToDeck}>
            <Icon name="arrow-left" />
            {backLabel}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="position-arrow-button"
            type="button"
            aria-label="Previous position"
            title="Previous position"
            disabled={!previous}
            onClick={previous}
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
            disabled={!next}
            onClick={next}
          >
            <Icon name="chevron-right" />
          </Button>
          {practiceLabel ? <span className="practice-scope-label" title={practiceLabel}>{practiceLabel}</span> : null}
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
              onMove={(orig, dest) => handleMove(orig, dest)}
            />
            {pendingPromotion && <PromotionChoice
              destination={pendingPromotion.dest}
              choices={pendingPromotion.choices}
              onChoose={choosePromotion}
              onCancel={cancelPromotion}
            />}
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
                onLoadNextReview={onLoadNextReview}
              />
            </div>
            <div className="solution-result-row">
              {allowSolutionEditing && canUpdateSolution ? (
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
            <KeyboardMoveInput fen={currentFen} status={positionAnnouncement(position)} disabled={position.isEnd()} onMove={handleKeyboardMove} />
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
