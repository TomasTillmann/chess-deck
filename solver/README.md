# Chess deck solver

Generate Stockfish solution trees for a FEN deck and store them in the app's
SQLite database through its server API. From the repository root, with the app
server running:

```bash
uv run --project solver solve-fens --deck fen/encyclopedia --config solver/appsettings.json --no-start-server --report solver/reports/encyclopedia.jsonl --parallel 8
```

`--deck` accepts a `.fen` file or its containing folder. A folder uses its
matching `<folder-name>.fen`, or the only `.fen` file when there is no match.
The collection slug comes from the filename; use `--name` to override it.
Slugs contain at most 64 lowercase letters, digits, underscores or hyphens and
start with a letter. Inferred names starting with a digit receive `deck-`.

The original command still works from the `solver` directory:

```bash
uv run solve-fens --input ../fen --name woodpecker
```

Select a pilot with `--positions 1,2,301,543,1087,1501,1801,2255,2530,3001`.
Puzzle numbers are 1-based non-empty FEN lines. `--limit 10` takes the first ten
selected positions. Duplicate FENs are solved once; the summary and report retain
their position count. `--parallel` defaults to four workers. Each puzzle opens
and closes its Stockfish process so worker shutdown completes reliably.

The API defaults to `http://127.0.0.1:3001`. Change it with `--server-url`.
Without `--no-start-server`, the solver starts a server if needed and stops only
that server when finished. `--server-dir` defaults to `../app/server` relative to
the current directory; use `--server-dir app/server` from the repository root.

## Resume, reports and replacement

Rerun the same command to resume: existing database solutions are skipped,
including manual edits and documents marked `needs_review`. Each completed tree
is stored immediately. The server also checks atomically that a solution has not
been saved while generation was running.

**`--overwrite` regenerates and replaces existing solutions, including manual
edits.** Combine it with `--positions` to regenerate only selected puzzles.

`--report` appends JSONL records containing run settings, generated documents,
storage outcomes, skipped FENs, errors and the final summary. Generated documents
are written before storage, so a failed API request leaves the tree available
for inspection or recovery. Resume uses the database, not report replay; a failed
or interrupted position is generated again on the next run.

The summary distinguishes `solved`, `needs_review`, existing solutions, duplicate
positions and errors. `solved` means the generator's configured quality checks
passed within its search budget; it is not an exhaustive chess proof.
`needs_review` retains an uncertain or incomplete tree for inspection and manual
correction. Engine or storage failures produce a nonzero exit status; review
flags alone do not.

## Engine settings and checks

Requires Stockfish on your PATH (or set `engine.path`) and `uv`. Stockfish path,
search limits, MultiPV and solution quality thresholds live in `appsettings.json`. The generator uses engine evaluations to retain critical
attacking choices and defensive resources, stopping at established tactical
outcomes and flagging unresolved search limits for review.

The default fast configuration uses a depth cap of 16, 75 ms for ordinary
searches, 1 second at roots, 300 ms for verification, and a 20-second puzzle
budget. The separate tree-depth limit remains 24 plies. Use 12 parallel workers
on the machine used for this run; lower `--parallel` on smaller machines.

The stronger configuration is preserved as `appsettings.deep.json` (500 ms
ordinary searches, 5-second roots, 2-second verification, no engine-depth cap,
120-second puzzle budget). Select it with `--config solver/appsettings.deep.json`.
Combine `--positions` and `--overwrite` for a deliberate deeper rerun; this also
replaces manual edits at those positions.

Elo limiting stays off: it deliberately weakens move choice and is not a compute
budget. Shorter searches provide the speedup. The 13-position fast benchmark took
20.6 seconds with 12 workers and retained all tested first moves and critical
resources; it is a bounded quality check, not a measured Elo rating or proof of
equal accuracy. See [the speed comparison](reports/benchmark-speed-review.md).

Run the CLI checks from `solver`:

```bash
uv run python -m unittest test_cli.py
```

## How a critical tree is built

The first player is the solving side. Each of their accepted alternatives has
`choice: "any"`; opponent resources use `choice: "all"`. Submit measures coverage
of that required tree: one accepted continuation suffices on the solving side,
and missing defensive branches lose credit. Extra user moves never enter the
penalty. Weights are fixed from the solution, so adding analysis cannot lower
coverage. Review-only revealed moves do not count as a new attempt.

The generator screens with MultiPV and widens competitive candidates as needed.
Roots receive a longer search and independently analyzed child positions;
first defenses also receive a longer search. Opponent checks are retained even
when they lose faster, because they can demand a different answer. Competitive
captures and promotions are included as additional resources. Captures of the
solver's last-moved piece, including en passant, are always retained unless an
exact immediate-mate certificate makes them trivial. Accepting a sacrifice
cannot disappear because of an unstable shallow evaluation. The configuration
records centipawn margins; exact mate distances are compared separately.

Branches end at actual mate/draw, a verified stable material conversion, or
multiple distinct continuations preserving the tactical advantage. Repeated
checking loops cannot supply the second continuation. Exact legal-move checks
remove defenses allowing immediate mate and record them in
`immediateMateReplies`; if every defense allows immediate mate the branch ends
with `unavoidable_mate`. If a null-move test confirms an existing mate-in-one
threat, every legal defense preventing that mate remains required, including
quiet moves and sacrifices. An incidental mating blunder alone does not make
all other moves required.
Stockfish centipawns and material counts are deliberately separate.

Depth, node, time, or candidate limits and ambiguous roots remain visibly
`needs_review`. These documents are stored, but their UI coverage is labeled
provisional. No finite engine search establishes a complete human-authored
solution for every position; edit the displayed variations and use **Save
solution** to replace an answer. Manual saves are marked `source: "manual"`.

The diverse ten-position study and its observed limitations are recorded in
[the pilot review](reports/pilot-review.md). The method draws on the
[Lichess generator](https://github.com/ornicar/lichess-puzzler/blob/master/generator/generator.py),
[Stockfish's MultiPV documentation](https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html#elo-cost-of-using-multipv),
and the [Stockfish WDL model](https://github.com/official-stockfish/WDL_model).
The defense tree and stopping heuristics are this project's adaptations.

All focused Python checks:

```bash
uv run --project solver python -m unittest discover -s solver -p 'test_*.py'
```
