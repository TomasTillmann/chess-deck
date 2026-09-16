import { useEffect, useRef, useState } from "react";
import type { Deck } from "../decks";
import {
  fetchReviewOptions, fetchReviewQueue, reviewDate, reviewInterval, saveReview,
  type ReviewOptions, type ReviewRating, type ReviewResult,
} from "../reviewClient";

const ratings: { rating: ReviewRating; label: string }[] = [
  { rating: "easy", label: "Easy" },
  { rating: "hard", label: "Hard" },
  { rating: "again", label: "Didn’t solve" },
];

type SaveState =
  | { status: "idle" }
  | { status: "loading" | "error"; rating: ReviewRating }
  | { status: "success"; result: ReviewResult };

export function ReviewPanel({ deck, fen, revealed, onGoToPosition }: {
  deck: Deck;
  fen: string;
  revealed: boolean;
  onGoToPosition: (index: number) => void;
}) {
  const [reviewId] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState<ReviewOptions>();
  const [optionsError, setOptionsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isFindingNext, setIsFindingNext] = useState(false);
  const [nextMessage, setNextMessage] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (revealed) panel.current?.scrollIntoView({ block: "nearest" });
  }, [revealed, saveState.status]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!revealed || options) return;
    let current = true;
    setOptionsError(false);
    fetchReviewOptions(deck.slug, fen).then(value => {
      if (current) setOptions(value);
    }).catch(() => {
      if (current) setOptionsError(true);
    });
    return () => { current = false; };
  }, [deck.slug, fen, revealed, options, reload]);

  async function rate(rating: ReviewRating) {
    if (saving.current || saveState.status === "success") return;
    saving.current = true;
    setSaveState({ status: "loading", rating });
    try {
      const result = await saveReview(deck.slug, fen, reviewId, rating);
      if (mounted.current) setSaveState({ status: "success", result });
    } catch {
      if (mounted.current) setSaveState({ status: "error", rating });
    } finally {
      saving.current = false;
    }
  }

  async function nextRecommended() {
    setIsFindingNext(true);
    setNextMessage("");
    try {
      const queue = await fetchReviewQueue(deck.slug);
      if (!mounted.current) return;
      const index = queue.recommendedFen ? deck.fens.indexOf(queue.recommendedFen) : -1;
      if (index >= 0) onGoToPosition(index);
      else setNextMessage(`All caught up.${queue.nextDueAt ? ` Next review: ${reviewDate(queue.nextDueAt)}.` : ""}`);
    } catch {
      if (mounted.current) setNextMessage("Could not load the next puzzle. Try Next recommended again.");
    } finally {
      if (mounted.current) setIsFindingNext(false);
    }
  }

  // Keep this component mounted while editing so a revealed attempt is rated only once.
  if (!revealed) return null;

  return (
    <section ref={panel} className="review-panel" aria-labelledby="review-heading">
      <h2 id="review-heading">How did it feel?</h2>
      <p className="review-description">Choose when to practice this puzzle again.</p>
      {options?.dueAt && options.options.easy.scheduleUnchanged && saveState.status === "idle" ? (
        <p className="review-description">Already scheduled for {reviewDate(options.dueAt)}. Easy and Hard keep that date.</p>
      ) : null}
      <div className="review-ratings">
        {ratings.map(({ rating, label }) => (
          <button
            key={rating}
            className={`review-rating is-${rating}`}
            type="button"
            aria-label={label}
            disabled={!options || saveState.status !== "idle"}
            onClick={() => void rate(rating)}
          >
            <strong>{label}</strong>
            <span>{options ? reviewInterval(options.options[rating]) : "…"}</span>
          </button>
        ))}
      </div>
      {!options && !optionsError ? <p className="review-description" role="status">Loading review times…</p> : null}
      {optionsError ? (
        <p className="review-message is-error" role="alert">
          Could not load review times. <button className="review-text-button" type="button" onClick={() => setReload(value => value + 1)}>Retry loading review times</button>
        </p>
      ) : null}
      {saveState.status === "loading" ? <p className="review-description" role="status">Saving review…</p> : null}
      {saveState.status === "error" ? (
        <p className="review-message is-error" role="alert">
          Could not confirm your review was saved. Your result is still here.{" "}
          <button className="review-text-button" type="button" onClick={() => void rate(saveState.rating)}>Retry saving review</button>
        </p>
      ) : null}
      {saveState.status === "success" ? (
        <div className="review-saved">
          <p className="review-message" role="status">
            Review saved · {ratings.find(item => item.rating === saveState.result.rating)?.label}.{" "}
            {saveState.result.scheduleUnchanged ? "Scheduled review kept: " : "Next review: "}
            <time dateTime={saveState.result.dueAt}>{reviewDate(saveState.result.dueAt)}</time>.
          </p>
          <button className="deck-back-button" type="button" disabled={isFindingNext} onClick={() => void nextRecommended()}>
            {isFindingNext ? "Finding next puzzle…" : "Next recommended"}
          </button>
        </div>
      ) : null}
      {nextMessage ? <p className="review-description" role="status">{nextMessage}</p> : null}
    </section>
  );
}
