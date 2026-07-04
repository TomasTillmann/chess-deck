# Woodpecker Solver

Sequential Stockfish solver for FEN collections.

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved
```

Useful checks:

```bash
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 1
uv run solve-fens --input ../fen --name woodpecker --output ../solved --limit 5 --overwrite
```

Stockfish path, search settings, MultiPV, and solver tuning live in `appsettings.json`.
