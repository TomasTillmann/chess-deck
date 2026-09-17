# Chess Deck App

Docker Compose runs the Chess Deck API server, its SQLite database, and the React UI.

```bash
cd app
docker compose up --build -d
```

Run that from the repository root. If you are already in this directory, run only
`docker compose up --build -d`.

Open the Docker-served UI at:

```text
http://localhost:5174
```

The API is exposed at:

```text
http://localhost:3001
```

The UI container maps host port `5174` to the Vite dev server. UI source and
config files are mounted into the container, so Vite hot reloads the browser
when those files change. `http://localhost:3000` is not used by this Compose
setup.

SQLite data is mounted from `server/data` into the server container at
`/data`, so the server reads `server/data/woodpecker.sqlite`.

To reset the app containers:

```bash
docker compose down
```

If Docker reports permission denied for `/var/run/docker.sock`, refresh the
current shell's docker group membership:

```bash
newgrp docker
```

That opens a shell with refreshed group membership. Stay in that shell and rerun
`docker compose up --build -d` from this directory.

## Spaced repetition

The API stores review schedules and immutable rating events in the same SQLite
file as the decks. The browser keeps only an anonymous learner UUID in local
storage; schedules survive server restarts. This is a browser profile, not an
account or authentication mechanism. Clearing browser storage creates a new
profile; sharing progress across browsers requires an account layer later.

Scheduling lives in `server/src/reviewScheduler.ts`, separate from SQLite and
HTTP. The Anki-inspired policy uses server time:

- **Didn't solve**: review in 10 minutes, reset successful repetitions, decrease
  ease by 0.2, and record a lapse (including the first failed attempt).
- **Hard**: 1 day initially, then the previous interval × 1.2, rounded up;
  decrease ease by 0.15.
- **Easy**: 4 days initially or after relearning, then the previous interval ×
  current ease × 1.3, rounded up; increase ease by 0.15.

Ease starts at 2.5 and stays between 1.3 and 3.0. Intervals stop at 3,650 days.
Easy/Hard during early manual practice preserve the existing schedule and
counters. Didn't solve always restarts the 10-minute learning step. This is a
small deterministic scheduler, not Anki's FSRS implementation.

`GET /v1/review-queue?learnerId=UUID&collection=slug` returns cards ordered by due
reviews, unseen positions, then future reviews. The backend chooses
`recommendedFen` uniformly at random from all due cards; if none are due, it
chooses uniformly from all unseen cards. Future cards are never recommended,
and the recommendation is null when all cards are scheduled. `nextDueAt` is
the earliest future review. Each card is keyed by collection and exact FEN,
so deck ordering and duplicate collection rows do not change its history.

`GET /v1/practice-queue?learnerId=UUID` applies that same selection across all
current decks. Optional repeated `collection=slug` parameters restrict the
view to those decks (duplicates are ignored). Both queue endpoints include
each card's source `collection` and a `recommendedCard` containing `collection`
and `fen`, or null; `recommendedFen` remains available for existing clients.
The draw is uniform across eligible cards, not across decks. Identical FENs
in different decks remain separate cards with their existing source schedules.

Practice scopes have no copied cards or separate progress.
Reviews still target the source collection through `POST /v1/reviews`. Deck
additions, position changes, and removals appear on the next queue request;
orphaned historical reviews are never included. `GET /v1/collections` likewise
discovers the current decks from the collections table, retaining known names
and deriving readable names from other slugs. Empty scopes return no cards.

Saved Deck Views store only a UUID, anonymous learner UUID, name, selected source
deck slugs, and timestamps in `deck_views`. Each learner has at most one view per
canonical selection (sorted, unique slugs). Starting the same selection reuses
its existing view, including a renamed name. New views default to source deck
names joined with ` + `. Saved views retain their selection when a source deck
is removed; the existing practice queue simply returns the surviving cards.
Deleting a view does not delete decks or review history. Practice All continues
to include every live deck without saving a view.

- `GET /v1/deck-views?learnerId=UUID` returns `{views: [...]}`.
- `GET /v1/deck-views/ID?learnerId=UUID` returns one view.
- `POST /v1/deck-views` accepts `{learnerId, collections: [slug, ...]}` and returns
  the created or existing view (200). New selections require existing decks.
- `PATCH /v1/deck-views/ID` accepts `{learnerId, name}`. Names are trimmed and must
  contain 1–200 characters; generated default names retain all selected names.
- `DELETE /v1/deck-views/ID?learnerId=UUID` removes only that view (204).

Each view response is `{id, name, collections, createdAt, updatedAt}`. All reads
and mutations are scoped to the learner UUID; a missing or other learner's view
returns 404. This uses the same anonymous profile model as reviews, not account
authentication.

`GET /v1/review-options?learnerId=UUID&collection=slug&fen=FEN` previews the same
backend transitions used by `POST /v1/reviews`. POST accepts `learnerId`,
`reviewId` (one UUID per submitted attempt), `collection`, `fen`, and `rating`
(`easy`, `hard`, or `again`). The card update and event are one transaction.
Retrying the same learner/review ID and payload returns its original response;
reusing it for another rating or position returns 409. Schedule fields supplied
by a client are rejected. Missing collection positions return 404.

Run backend checks with `cd server && npm ci && npm test && npm run build`.
Review tests use temporary or in-memory databases, never the application data.

## Statistics

The navigation menu opens `#/statistics`, with all-deck and individual-deck
filters. `GET /v1/statistics?learnerId=UUID` reads existing review events and
schedules; it creates no counters or additional persistence. Optional parameters
are `collection=slug`, `days=30|90|365` (default 30), and an IANA `timeZone`
(default UTC; the UI supplies the browser's zone).

Review totals, distinct practiced cards, practice days, activity and ratings use
the selected period including today. Each saved rating counts as one review;
these are not session counts or solution-accuracy percentages. Deck and card
history show all-time totals. The 14-day forecast counts each card's next
scheduled review; overdue cards appear separately in Due now.

Statistics share the learner and source-card identities used by practice.
Duplicate source rows count once; removed source cards are excluded without
deleting their history. All-deck and Deck View practice contributes to the same
source-deck totals. Calendar grouping respects local dates and daylight saving.
