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

`GET /v1/review-options?learnerId=UUID&collection=slug&fen=FEN` previews the same
backend transitions used by `POST /v1/reviews`. POST accepts `learnerId`,
`reviewId` (one UUID per submitted attempt), `collection`, `fen`, and `rating`
(`easy`, `hard`, or `again`). The card update and event are one transaction.
Retrying the same learner/review ID and payload returns its original response;
reusing it for another rating or position returns 409. Schedule fields supplied
by a client are rejected. Missing collection positions return 404.

Run backend checks with `cd server && npm ci && npm test && npm run build`.
Review tests use temporary or in-memory databases, never the application data.
