# Solver Agent Notes

This folder is a standalone `uv` Python project for solving Woodpecker FEN
collections with Stockfish.

## CLI Usage

Run from this folder:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved
```

Common verification runs:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 1
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 5 --overwrite
```

CLI options:

- `--input`: base folder containing FEN collections.
- `--name`: collection name. For `woodpecker`, input is
  `../fen/woodpecker/woodpecker.fen`.
- `--output`: base folder for solved JSON output.
- `--config`: path to settings JSON. Defaults to `appsettings.json`.
- `--limit`: optional maximum number of FENs to process from the start.
- `--overwrite`: regenerate existing `N.json` files and clear the run's error log.

Do not add CLI flags for Stockfish path, threads, depth, movetime, MultiPV, or
solver tuning. Those belong in `appsettings.json`.

## Output Layout

For:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved
```

the solver reads:

```text
../fen/woodpecker/woodpecker.fen
```

and writes:

```text
../solved/woodpecker/1.json
../solved/woodpecker/2.json
...
../solved/woodpecker/errors.jsonl
```

One non-empty FEN line becomes one output number. Order is preserved, so the
first non-empty FEN line is `1.json`.

Output moves are UCI only. Do not emit SAN.

## Architecture

Main files:

- `src/woodpecker_solver/cli.py`: Typer CLI, file discovery, output writing,
  overwrite behavior, and error logging.
- `src/woodpecker_solver/config.py`: typed dataclasses for `appsettings.json`.
- `src/woodpecker_solver/engine.py`: sequential Stockfish wrapper using
  `python-chess`.
- `src/woodpecker_solver/solver.py`: recursive FEN tree builder and stopping
  logic.
- `appsettings.json`: Stockfish settings, solver thresholds, output formatting,
  and log filename.

The solver runs one Stockfish process sequentially. It processes FENs one by
one and does not parallelize.

## Stockfish Settings

Stockfish is started from:

```json
"engine": {
  "path": "/home/tomas/.local/bin/stockfish"
}
```

The engine is configured from JSON:

- `threads`: Stockfish `Threads`.
- `hash_mb`: Stockfish `Hash`.
- `limit_strength`: Stockfish `UCI_LimitStrength`.
- `uci_elo`: applied only when `limit_strength` is true.
- `movetime_ms`: per-analysis time limit.
- `max_movetime_ms`: upper cap for `movetime_ms`.
- `depth`: optional depth limit. If set, analysis uses both depth and time.
- `multipv`: number of candidate moves to request.

`MultiPV` is not passed through `engine.configure()`, because `python-chess`
manages it internally. The JSON value is applied on each `analyse(...,
multipv=N)` call.

## Eval Meaning

The original FEN side to move is the solving side.

All JSON evals are centipawns from the solving side's perspective:

- positive means good for the solver
- negative means good for the opponent
- mate scores are converted using `solver.mate_score_cp`

Internally, candidate moves are sorted from the current mover's perspective, so:

- on solver turns, the highest eval is best for the solver
- on opponent turns, the highest mover eval is best for the opponent

## Candidate Selection

At each node, the solver asks Stockfish for up to `engine.multipv` candidates.
It does not blindly include all returned moves.

Current defaults:

```json
"engine": {
  "multipv": 10
},
"solver": {
  "best_move_margin_cp": 60,
  "clear_gap_cp": 80,
  "max_best_moves": 8
}
```

Selection rule:

1. Sort candidates from the current side-to-move's perspective.
2. Start the cluster with the best move.
3. Include additional moves within `best_move_margin_cp` of the best move.
4. Require the next move after the cluster to drop by at least `clear_gap_cp`.
5. Keep at most `max_best_moves` from the selected cluster.

If there is exactly one legal/candidate move, it is accepted as forced.

## Solver vs Opponent Turns

The side to move in the original FEN is the solver.

On the solver's turn:

- include all clearly best moves in the cluster
- if there is no clear gap at the root and `skip_if_no_clear_gap` is true,
  skip/log the FEN
- if there is no clear gap below the root, stop that branch with
  `"terminal": "no_clear_gap"`

On the opponent's turn:

- include clearly best defensive replies when a clear cluster exists
- if there is no clear gap, choose only the opponent's single best engine move
  and continue

This means `no_clear_gap` is a stopping condition for the solver's choices, not
for the opponent's choices.

## Stopping Rules

Tree search stops when any of these apply:

- checkmate: `"terminal": "checkmate"`
- draw-like terminal state: `"terminal": "draw"`
- recursion limit reached: `"terminal": "max_depth"`
- solver-side position has no clear move cluster: `"terminal": "no_clear_gap"`
- solver-side win is robust: `"terminal": "robust_win"`

Current depth default:

```json
"max_depth": 10
```

Robust win applies only when it is the solver's turn. Defaults:

```json
"winning_eval_cp": 300,
"robust_win_ratio": 0.85,
"robust_sample_multipv": 10,
"min_moves_for_robust_stop": 8
```

Robust win rule:

1. Eval from the solver's perspective must be at least `winning_eval_cp`.
2. The position must have at least `min_moves_for_robust_stop` legal moves.
3. At least `min_moves_for_robust_stop` sampled candidates must exist.
4. At least `robust_win_ratio` of sampled candidates must preserve an eval of
   `winning_eval_cp` or better.

When that holds, the node is marked:

```json
"terminal": "robust_win"
```

## Error Log

Invalid FENs, root skips, and runtime errors are appended as JSON lines to:

```text
../solved/<name>/errors.jsonl
```

With `--overwrite`, the error log for that output collection is removed at the
start of the run.

## Development Notes

After changing solver code, run:

```bash
uv run python -m py_compile src/woodpecker_solver/*.py
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 5 --overwrite
```

Keep the CLI simple. Solver behavior should be changed through
`appsettings.json`, not new command-line flags, unless the requested behavior is
about collection selection or output management.
