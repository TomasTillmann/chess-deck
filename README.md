Chess Deck
==========

Extract chess diagrams from PDF books into FEN.

Run the app with Docker:

```bash
cd app
docker compose up --build
```

The UI is served at `http://localhost:5174` and the API at
`http://localhost:3001`.

The current parser targets Quality Chess-style PDFs where diagrams are embedded as chess-font
glyphs. That is more deterministic than image OCR for The Woodpecker Method, but the package is
kept small so image recognizers can be added for scanned books later.

Side to move is read from the marker rectangle on the right edge of the board: top means black,
bottom means white.

Run the first puzzle page:

```bash
uv run woodpecker --book books/woodpecker/woodpecker.pdf --pages 33 --out-dir fen/woodpecker
```

Run the full exercise section:

```bash
uv run woodpecker --book books/woodpecker/woodpecker.pdf --pages 33-223 --fen-file fen/woodpecker/woodpecker.fen
```
