# Woodpecker Solver

Stockfish solver for FEN collections.

```bash
uv run solve-fens --input ../fen --name woodpecker
```

By default, the solver solves up to 4 FENs concurrently. Adjust the concurrency
with `--parallel`:

```bash
uv run solve-fens --input ../fen --name woodpecker --parallel 16
```

Useful checks:

```bash
uv run solve-fens --input ../fen --name woodpecker --limit 1
uv run solve-fens --input ../fen --name woodpecker --limit 5 --parallel 2
uv run solve-fens --input ../fen --name woodpecker --limit 5 --parallel 2 --overwrite
```

Each worker keeps one Stockfish process alive and reuses it for every FEN it
solves.

Solved trees are stored through the Woodpecker server API. Start the server
first, or let the solver start it automatically from `../app/server`. Pass
`--server-url` if it is not running on `http://127.0.0.1:3001`, or
`--server-dir` if the server project is elsewhere.

Stockfish path, search settings, MultiPV, and solver tuning live in `appsettings.json`.
