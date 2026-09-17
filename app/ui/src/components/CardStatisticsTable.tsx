import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Button } from "../design-system";
import type { CardStatistics, Statistics } from "../statisticsClient";
import type { CardStatisticsViewState } from "../statisticsViewState";

const pageSize = 20;

function dateLabel(date: string | null) {
  return date ? <time dateTime={date} title={new Date(date).toLocaleString()}>{new Date(date).toLocaleDateString()}</time> : "Never";
}

function intervalLabel(days: number | null) {
  if (days === null) return "—";
  if (days < 1 / 24) return `${Math.round(days * 1440)} min`;
  if (days < 1) return `${Math.round(days * 24)} hr`;
  return `${Math.round(days).toLocaleString()} d`;
}

export function CardStatisticsTable({ cards, decks, selection, onSelectionChange }: {
  cards: CardStatistics[];
  decks: Statistics["decks"];
  selection: CardStatisticsViewState;
  onSelectionChange: (changes: Partial<CardStatisticsViewState>) => void;
}) {
  const { filter, sort, page } = selection;
  const heading = useRef<HTMLHeadingElement>(null);
  const paginationRequested = useRef(false);
  const names = new Map(decks.map(deck => [deck.collection, deck.name]));
  const rows = useMemo(() => cards.filter(card => filter === "all" || (filter === "reviewed" ? card.reviews > 0 : card.status === filter))
    .sort((a, b) => (sort === "reviews" ? b.reviews - a.reviews : sort === "lapses" ? b.lapses - a.lapses : 0)
      || a.collection.localeCompare(b.collection) || a.positionIndex - b.positionIndex), [cards, filter, sort]);
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const firstRow = currentPage * pageSize;

  useEffect(() => {
    if (page !== currentPage) onSelectionChange({ page: currentPage });
  }, [page, currentPage, onSelectionChange]);

  useLayoutEffect(() => {
    if (!paginationRequested.current) return;
    paginationRequested.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [currentPage]);

  const changePage = (next: number) => {
    paginationRequested.current = true;
    onSelectionChange({ page: next });
  };

  return <section className="statistics-section" aria-labelledby="card-history-title">
    <div className="statistics-section-heading"><div>
      <h2 id="card-history-title" ref={heading} tabIndex={-1}>Card history</h2><p>All-time reviews and the current schedule for each puzzle.</p>
    </div></div>
    <div className="statistics-filters statistics-filters--cards">
      <label className="statistics-field">Cards
        <select value={filter} onChange={event => onSelectionChange({ filter: event.target.value as CardStatisticsViewState["filter"], page: 0 })}>
          <option value="all">All cards</option><option value="reviewed">Practiced cards</option><option value="due">Due now</option><option value="new">New cards</option>
        </select>
      </label>
      <label className="statistics-field">Sort by
        <select value={sort} onChange={event => onSelectionChange({ sort: event.target.value as CardStatisticsViewState["sort"], page: 0 })}>
          <option value="reviews">Most reviews</option><option value="lapses">Most lapses</option><option value="position">Position number</option>
        </select>
      </label>
    </div>
    {rows.length === 0 ? <p className="statistics-empty" role="status">No cards match this filter.</p> : <>
      <div className="statistics-table-scroll" role="region" aria-label="Card history table" tabIndex={0}>
        <table className="statistics-table statistics-table--cards">
          <thead><tr><th scope="col">Card</th><th scope="col">Reviews</th><th scope="col">Lapses</th><th scope="col">Last practiced</th><th scope="col">Next review</th><th scope="col">Interval</th></tr></thead>
          <tbody>{rows.slice(firstRow, firstRow + pageSize).map(card => <tr key={`${card.collection}:${card.fen}`}>
            <th scope="row"><a href={`#/decks/${encodeURIComponent(card.collection)}/positions/${card.positionIndex + 1}`}>Position {card.positionIndex + 1}</a><span className="statistics-card-deck">{names.get(card.collection) ?? card.collection}</span></th>
            <td>{card.reviews.toLocaleString()}</td><td>{card.lapses.toLocaleString()}</td><td>{dateLabel(card.lastReviewedAt)}</td>
            <td>{card.status === "new" ? "New" : card.status === "due" ? <span className="statistics-due">Due now</span> : dateLabel(card.dueAt)}</td><td>{intervalLabel(card.intervalDays)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="statistics-pagination">
        <span role="status">{(firstRow + 1).toLocaleString()}–{Math.min(firstRow + pageSize, rows.length).toLocaleString()} of {rows.length.toLocaleString()} cards</span>
        <div><Button disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="Previous page of cards">Previous</Button><Button disabled={currentPage === lastPage} onClick={() => changePage(currentPage + 1)} aria-label="Next page of cards">Next</Button></div>
      </div>
    </>}
    <p className="statistics-note">Lapses count the times you chose “Didn’t solve” for a card.</p>
  </section>;
}
