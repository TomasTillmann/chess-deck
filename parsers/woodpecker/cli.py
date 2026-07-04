from pathlib import Path

import typer

from .quality_chess import extract_pdf, write_results

app = typer.Typer(help="Extract chess diagrams from books into FEN.")


@app.command()
def extract(
    book: Path = typer.Option(
        Path("books/woodpecker/woodpecker.pdf"),
        "--book",
        "-b",
        help="PDF book to parse.",
    ),
    out_dir: Path = typer.Option(
        Path("fen/woodpecker"),
        "--out-dir",
        "-o",
        help="Directory where FEN results are written.",
    ),
    pages: str = typer.Option(
        "33",
        "--pages",
        "-p",
        help="1-based PDF page numbers, e.g. 33 or 33-35.",
    ),
    book_name: str = typer.Option(
        "woodpecker",
        "--book-name",
        help="Stable name used in output filenames.",
    ),
    fen_file: Path | None = typer.Option(
        None,
        "--fen-file",
        help="Exact FEN file path to write. Overrides generated filename.",
    ),
    metadata: bool = typer.Option(
        False,
        "--metadata/--no-metadata",
        help="Also write JSONL metadata next to the FEN file.",
    ),
) -> None:
    results = extract_pdf(book, pages=pages)
    paths = write_results(
        results,
        out_dir=out_dir,
        book_name=book_name,
        pages=pages,
        fen_file=fen_file,
        metadata=metadata,
    )
    typer.echo(f"Extracted {len(results)} diagram(s)")
    typer.echo(f"Wrote {paths['fen']}")
    if "jsonl" in paths:
        typer.echo(f"Wrote {paths['jsonl']}")
