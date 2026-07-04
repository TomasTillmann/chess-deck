# Woodpecker Solver

Stockfish solver for FEN collections.

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved
```

By default, the solver solves up to 4 FENs concurrently. Adjust the concurrency
with `--parallel`:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved --parallel 16
```

Useful checks:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 1
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 5 --parallel 2
```

Each worker keeps one Stockfish process alive and reuses it for every FEN it
solves.

Stockfish path, search settings, MultiPV, and solver tuning live in `appsettings.json`.
