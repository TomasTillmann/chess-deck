import { useEffect, useRef, useState } from "react";
import type { Deck } from "../decks";
import { Button, type ThemeProps } from "../design-system";
import { fetchReviewQueue, saveReview, type ReviewRating } from "../reviewClient";

const ratings: { rating: ReviewRating; label: string }[] = [
  { rating: "easy", label: "Easy" },
  { rating: "hard", label: "Hard" },
  { rating: "again", label: "Didn’t solve" },
];

export function ReviewPanel({ deck, fen, revealed, onGoToPosition, onLoadNextReview, theme }: ThemeProps & {
  deck: Deck;
  fen: string;
  revealed: boolean;
  onGoToPosition: (index: number) => void;
  onLoadNextReview?: () => Promise<void>;
}) {
  const [reviewId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "finished">("idle");
  const [error, setError] = useState("");
  const chosenRating = useRef<ReviewRating | undefined>(undefined);
  const saved = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function rate(rating: ReviewRating) {
    if (busy.current || status === "finished") return;
    busy.current = true;
    chosenRating.current = rating;
    setStatus("saving");
    setError("");
    try {
      if (!saved.current) {
        await saveReview(deck.slug, fen, reviewId, rating);
        saved.current = true;
      }
      if (!mounted.current) return;
      if (onLoadNextReview) {
        await onLoadNextReview();
        if (mounted.current) setStatus("finished");
        return;
      }
      const queue = await fetchReviewQueue(deck.slug);
      if (!mounted.current) return;
      const index = queue.recommendedFen ? deck.fens.indexOf(queue.recommendedFen) : -1;
      if (queue.recommendedFen && index < 0) throw new Error("Recommended position is unavailable");
      setStatus("finished");
      if (index >= 0) onGoToPosition(index);
    } catch {
      if (mounted.current) {
        setError(saved.current ? "Saved. Couldn’t load next puzzle." : "Couldn’t save review.");
        setStatus("error");
      }
    } finally {
      busy.current = false;
    }
  }

  // Reserve the controls' space, and retain the attempt when the move tree is edited.
  return (
    <>
      <div className={`review-ratings${revealed ? "" : " is-hidden"}`} data-theme={theme} role="group" aria-label="Rate puzzle" aria-hidden={!revealed} aria-busy={status === "saving"}>
        {ratings.map(({ rating, label }) => (
          <Button
            key={rating}
            className={`review-rating is-${rating}`}
            variant={rating === "easy" ? "success" : rating === "hard" ? "warning" : "danger"}
            type="button"
            disabled={!revealed || status !== "idle"}
            onClick={() => void rate(rating)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="review-feedback" data-theme={theme} role="status">
        {revealed && status === "error" ? <>{error} <Button variant="ghost" size="compact" className="review-text-button" type="button" onClick={() => void rate(chosenRating.current!)}>Retry</Button></> : null}
        {revealed && status === "finished" ? "All caught up." : null}
      </div>
    </>
  );
}
