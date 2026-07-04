Woodpecker
==========

Extract chess diagrams from PDF books into FEN.

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
