# Solver Agent Notes

Standalone `uv` project using Stockfish and python-chess. Follow the repository's
existing small-module layout; do not add dependencies for orchestration.

## Run and verify

From the repository root:

```bash
uv run --project solver solve-fens --deck fen/encyclopedia --config solver/appsettings.json --no-start-server --parallel 8 --report solver/reports/encyclopedia.jsonl
uv run --project solver python -m unittest discover -s solver -p 'test_*.py'
```

The legacy invocation from this directory still works:

```bash
uv run solve-fens --input ../fen --name woodpecker
```

Use `--positions 1,2,301` or `--limit 10` for samples. `--deck` accepts a FEN
file or folder. `--name` overrides the inferred backend collection slug.
Stockfish path, timing, MultiPV, depth, and all solver tuning belong in
`appsettings.json`, not new CLI flags. See README for the full workflow.

## Architecture and storage

- `cli.py`: input selection, rolling process pool, HTTP storage, reports.
- `engine.py`: UCI analysis; `config.py`: typed settings and validation.
- `solver.py`: critical move selection, stopping, and quality metadata.

Each puzzle owns one Stockfish context manager. Close the engine before its
worker returns: process-exit hooks can hang while python-chess threads remain
alive. The parent stores each result immediately through the backend API.

Storage key is `(collection, original FEN)`. Duplicate source rows share one
solution. Default generation skips existing records and sends `overwrite:false`
for atomic preservation of edits made during generation. `--overwrite` explicitly
replaces existing solutions, including manual edits. Back up before bulk replacement.
The optional JSONL report records generated trees before storage, plus run,
storage, error, and final summary events; resume uses backend existence.

## Tree contract

Keep the existing `root -> moves[{uci,children:[position]}]` JSON structure.
Output moves are UCI only, never SAN. Original side to move is the solving side.
Evaluations are from that side's perspective; mate distance is recorded separately.
Position `choice:"any"` means equivalent solver continuations; `choice:"all"`
means required opponent resources. UI scoring respects this distinction.

`status:"solved"` means the configured search/stopping criteria were satisfied,
not a mathematical proof. `status:"needs_review"` plus `quality.reviewReasons`
must identify unresolved bounds or ambiguous positions. Do not silently mark
max-depth/max-node/time/candidate limits as successful tactical resolution.
Root trees must not be empty. Preserve move history for repetition/draw detection.

Root/child verification, explicit mate handling, multiple defensive resources,
and stable tactical stopping are intentional. Modern Stockfish centipawns are
not material counts. Do not revert to one defensive PV, fixed top-ten searches,
or ending solely because no evaluation gap was found.

## Quality checks

Use a diverse ten-position pilot before broad algorithm changes. Current sample:
1, 2, 301, 543, 1087, 1501, 1801, 2255, 2530, 3001.
Replay every output move for legality, inspect branches and terminal reasons,
compare root choices with stronger searches, and report incomplete trees honestly.
Research and sample findings live in `reports/*.md`; generated databases and
JSONL analysis artifacts are ignored by Git.
