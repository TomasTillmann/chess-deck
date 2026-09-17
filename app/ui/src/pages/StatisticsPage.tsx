import { useEffect, useState } from "react";
import { fetchDecks, type Deck } from "../decks";
import { BarChart, Button, MetricStrip, PageHeader, RatingBreakdown, StatusMessage } from "../design-system";
import { CardStatisticsTable } from "../components/CardStatisticsTable";
import { chartPoints, fetchStatistics, type Statistics, type StatisticsPeriod } from "../statisticsClient";
import "./StatisticsPage.css";

export function StatisticsPage({ decks, onDecksChange }: { decks: Deck[]; onDecksChange: (decks: Deck[]) => void }) {
  const [collection, setCollection] = useState("");
  const [days, setDays] = useState<StatisticsPeriod>(30);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Statistics>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError(undefined);
    void Promise.all([fetchDecks(controller.signal), fetchStatistics(collection, days, controller.signal)]).then(([catalog, result]) => {
      if (controller.signal.aborted) return;
      onDecksChange(catalog);
      if (collection && !catalog.some(deck => deck.slug === collection)) setCollection("");
      else setData(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load statistics.");
    });
    return () => controller.abort();
  }, [collection, days, revision, onDecksChange]);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const loading = !data && !error;
  const format = (value: number) => value.toLocaleString();
  const period = `Last ${days} days`;

  return <main className="deck-page statistics-page">
    <PageHeader title="Statistics" actions={<Button disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>}>
      Your practice, one review at a time.
    </PageHeader>
    <div className="statistics-content">
      <div className="statistics-filters">
        <label className="statistics-field">Deck
          <select value={collection} onChange={event => setCollection(event.target.value)}>
            <option value="">All decks</option>
            {decks.map(deck => <option key={deck.slug} value={deck.slug}>{deck.name}</option>)}
          </select>
        </label>
        <label className="statistics-field">History
          <select value={days} onChange={event => setDays(Number(event.target.value) as StatisticsPeriod)}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </label>
      </div>

      {loading && <StatusMessage role="status">Loading statistics…</StatusMessage>}
      {error && <div className="statistics-error" role="alert">
        <StatusMessage tone="danger">{error}</StatusMessage>
        <Button onClick={() => setRevision(value => value + 1)}>Retry</Button>
      </div>}

      {data && <>
        <MetricStrip items={[
          { label: "Reviews", value: format(data.summary.reviews), detail: period },
          { label: "Cards practiced", value: format(data.summary.reviewedCards), detail: period },
          { label: "Practice days", value: `${format(data.summary.practiceDays)} / ${days}`, detail: period },
          { label: "Due now", value: format(data.summary.dueCards), detail: "Ready to practice" },
        ]} />
        {data.summary.totalCards === 0 ? <p className="statistics-empty">No cards in this selection yet. Statistics will appear as you add decks and practice.</p> : <>
          <section className="statistics-section" aria-labelledby="activity-title">
            <div className="statistics-section-heading">
              <div><h2 id="activity-title">Review activity</h2><p>{days === 365 ? "Reviews per week" : "Reviews per day"} · {period.toLowerCase()}</p></div>
              <span className="statistics-note">One saved rating = one review</span>
            </div>
            <BarChart label="Review activity" points={chartPoints(data.activity, days === 365)} emptyMessage="No reviews in this period. Rate a puzzle to start your history." />
          </section>

          <div className="statistics-chart-grid">
            <section className="statistics-section" aria-labelledby="forecast-title">
              <div className="statistics-section-heading"><div>
                <h2 id="forecast-title">Upcoming reviews</h2>
                <p>Next 14 days · current schedule</p>
              </div></div>
              <BarChart label="Upcoming reviews" points={chartPoints(data.forecast)} tone="warning" emptyMessage="No upcoming reviews in the next 14 days." />
              <p className="statistics-note">Next scheduled review per card. Cards already due are counted above.</p>
            </section>
            <section className="statistics-section" aria-labelledby="ratings-title">
              <div className="statistics-section-heading"><div>
                <h2 id="ratings-title">Your ratings</h2><p>{period}</p>
              </div></div>
              <RatingBreakdown items={[
                { label: "Easy", value: data.ratings.easy, tone: "success" },
                { label: "Hard", value: data.ratings.hard, tone: "warning" },
                { label: "Didn’t solve", value: data.ratings.again, tone: "danger" },
              ]} />
              <p className="statistics-note">Based on the three review buttons, independent of solution coverage.</p>
              <dl className="statistics-card-counts">
                <div><dt>New cards</dt><dd>{format(data.summary.newCards)}</dd></div>
                <div><dt>Scheduled later</dt><dd>{format(data.summary.scheduledCards)}</dd></div>
                <div><dt>Total cards</dt><dd>{format(data.summary.totalCards)}</dd></div>
              </dl>
            </section>
          </div>

          <section className="statistics-section" aria-labelledby="deck-history-title">
            <div className="statistics-section-heading"><div>
              <h2 id="deck-history-title">Deck history</h2><p>All-time totals · select a deck to explore its history</p>
            </div></div>
            <div className="statistics-table-scroll" role="region" aria-label="Deck history table" tabIndex={0}>
              <table className="statistics-table">
                <thead><tr><th scope="col">Deck</th><th scope="col">Reviews</th><th scope="col">Cards practiced</th><th scope="col">Due now</th><th scope="col">Last practiced</th></tr></thead>
                <tbody>{data.decks.map(deck => <tr key={deck.collection}>
                  <th scope="row"><button className="statistics-text-button" onClick={() => setCollection(deck.collection)}>{deck.name}</button></th>
                  <td>{format(deck.reviews)}</td><td>{format(deck.reviewedCards)} / {format(deck.totalCards)}</td><td>{format(deck.dueCards)}</td>
                  <td>{deck.lastReviewedAt ? <time dateTime={deck.lastReviewedAt} title={new Date(deck.lastReviewedAt).toLocaleString()}>{new Date(deck.lastReviewedAt).toLocaleDateString()}</time> : "Never"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <CardStatisticsTable key={collection} cards={data.cards} decks={data.decks} />
        </>}
        <p className="statistics-footnote">Dates use {data.timeZone.replace(/_/g, " ")}. History includes cards currently in your decks. Reviews from Practice All and Deck Views count toward their source decks.</p>
      </>}
    </div>
  </main>;
}
