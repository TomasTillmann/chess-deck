from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Iterable

import chess
import fitz

BOARD_END = "\uf035"
RANK_STARTS = {chr(codepoint) for codepoint in range(0xF0C0, 0xF0C8)}
EMPTY_SQUARES = {" ", "\uf020", "\uf02b"}
SIDE_MARKERS = {
    "\uf071": "b",
    "\uf072": "w",
}

PIECE_GLYPHS = {
    "\uf04b": "K",
    "\uf06b": "K",
    "\uf051": "Q",
    "\uf071": "Q",
    "\uf052": "R",
    "\uf072": "R",
    "\uf042": "B",
    "\uf062": "B",
    "\uf04e": "N",
    "\uf06e": "N",
    "\uf050": "P",
    "\uf070": "P",
    "\uf04c": "k",
    "\uf06c": "k",
    "\uf057": "q",
    "\uf077": "q",
    "\uf054": "r",
    "\uf074": "r",
    "\uf056": "b",
    "\uf076": "b",
    "\uf04d": "n",
    "\uf06d": "n",
    "\uf04f": "p",
    "\uf06f": "p",
}


@dataclass(frozen=True)
class TextLine:
    text: str
    bbox: tuple[float, float, float, float]

    @property
    def x_center(self) -> float:
        return (self.bbox[0] + self.bbox[2]) / 2

    @property
    def y_center(self) -> float:
        return (self.bbox[1] + self.bbox[3]) / 2


@dataclass(frozen=True)
class DiagramFen:
    page: int
    exercise: int | None
    active_color: str
    placement: str
    fen: str
    label: str | None
    bbox: tuple[float, float, float, float]


def extract_pdf(book: Path, pages: str) -> list[DiagramFen]:
    page_numbers = list(parse_pages(pages))
    results: list[DiagramFen] = []
    with fitz.open(book) as doc:
        for page_number in page_numbers:
            page_index = page_number - 1
            if page_index < 0 or page_index >= len(doc):
                raise ValueError(f"Page {page_number} is outside {book} ({len(doc)} pages)")
            results.extend(extract_page(doc[page_index], page_number=page_number))
    return sorted(results, key=lambda item: (item.page, item.bbox[0], item.bbox[1]))


def extract_page(page: fitz.Page, page_number: int) -> list[DiagramFen]:
    lines = read_lines(page)
    boards = group_board_rows(read_rank_lines(page))
    markers = [line for line in lines if line.text.strip() in SIDE_MARKERS]
    numbers = [line for line in lines if line.text.strip().isdigit()]
    labels = [line for line in lines if is_label_line(line.text)]

    diagrams: list[DiagramFen] = []
    for board_rows in boards:
        bbox = union_bbox(line.bbox for line in board_rows)
        placement = rows_to_placement([line.text for line in board_rows])
        active_color = find_active_color(bbox, markers)
        fen = f"{placement} {active_color} - - 0 1"
        chess.Board(fen)
        diagrams.append(
            DiagramFen(
                page=page_number,
                exercise=find_exercise_number(bbox, numbers),
                active_color=active_color,
                placement=placement,
                fen=fen,
                label=find_label(bbox, labels),
                bbox=round_bbox(bbox),
            )
        )
    return diagrams


def read_lines(page: fitz.Page) -> list[TextLine]:
    lines: list[TextLine] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).rstrip("\n")
            if text:
                lines.append(TextLine(text=text, bbox=tuple(line["bbox"])))
    return lines


def read_rank_lines(page: fitz.Page) -> list[TextLine]:
    line_rows = [line for line in read_lines(page) if is_rank_line(line.text)]
    raw_rows = read_raw_rank_lines(page)
    combined = list(line_rows)
    for raw_row in raw_rows:
        if not any(same_rank_position(raw_row, line_row) for line_row in combined):
            combined.append(raw_row)
    return combined


def read_raw_rank_lines(page: fitz.Page) -> list[TextLine]:
    chars = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                for char in span.get("chars", []):
                    glyph = char["c"]
                    if glyph in RANK_STARTS or glyph == BOARD_END or glyph in PIECE_GLYPHS or glyph in EMPTY_SQUARES:
                        chars.append((glyph, tuple(char["bbox"])))

    rank_lines: list[TextLine] = []
    for start, start_bbox in [(glyph, bbox) for glyph, bbox in chars if glyph in RANK_STARTS]:
        x0, y0, _, _ = start_bbox
        row_chars = [start]
        row_boxes = [start_bbox]
        for square_index in range(1, 9):
            target_x = x0 + 18 * square_index
            candidates = [
                (glyph, bbox)
                for glyph, bbox in chars
                if abs(bbox[1] - y0) < 2.5 and abs(bbox[0] - target_x) < 3.5
            ]
            chosen = choose_square_glyph(candidates, target_x=target_x, target_y=y0)
            row_chars.append(chosen[0])
            row_boxes.append(chosen[1])
        end_x = x0 + 18 * 9
        end_candidates = [
            (glyph, bbox)
            for glyph, bbox in chars
            if glyph == BOARD_END and abs(bbox[1] - y0) < 2.5 and abs(bbox[0] - end_x) < 3.5
        ]
        if not end_candidates:
            continue
        row_chars.append(BOARD_END)
        row_boxes.append(end_candidates[0][1])
        rank_lines.append(TextLine(text="".join(row_chars), bbox=union_bbox(row_boxes)))
    return rank_lines


def same_rank_position(first: TextLine, second: TextLine) -> bool:
    return abs(first.bbox[0] - second.bbox[0]) < 3 and abs(first.bbox[1] - second.bbox[1]) < 3


def choose_square_glyph(
    candidates: list[tuple[str, tuple[float, float, float, float]]],
    target_x: float,
    target_y: float,
) -> tuple[str, tuple[float, float, float, float]]:
    for glyph, bbox in candidates:
        if glyph in PIECE_GLYPHS:
            return glyph, bbox
    for glyph, bbox in candidates:
        if glyph in EMPTY_SQUARES:
            return glyph, bbox
    return " ", (target_x, target_y, target_x + 18, target_y + 18)


def group_board_rows(rank_lines: list[TextLine]) -> list[list[TextLine]]:
    columns: list[list[TextLine]] = []
    for line in sorted(rank_lines, key=lambda item: item.bbox[0]):
        for column in columns:
            if abs(column[0].bbox[0] - line.bbox[0]) < 8:
                column.append(line)
                break
        else:
            columns.append([line])

    boards: list[list[TextLine]] = []
    for column in columns:
        current: list[TextLine] = []
        previous_y: float | None = None
        for line in sorted(column, key=lambda item: item.bbox[1]):
            if previous_y is not None and line.bbox[1] - previous_y > 30:
                append_complete_board(boards, current)
                current = []
            current.append(line)
            previous_y = line.bbox[1]
        append_complete_board(boards, current)
    return sorted(boards, key=lambda rows: (find_board_number_hint(rows), rows[0].bbox[1], rows[0].bbox[0]))


def append_complete_board(boards: list[list[TextLine]], rows: list[TextLine]) -> None:
    if not rows:
        return
    if len(rows) != 8:
        raise ValueError(f"Expected 8 board rows, found {len(rows)} near {rows[0].bbox}")
    boards.append(rows)


def rows_to_placement(rows: list[str]) -> str:
    fen_rows = []
    for row in rows:
        text = row.rstrip("\n")
        inner = text[1:-1]
        if len(inner) != 8:
            raise ValueError(f"Expected 8 squares in row {text!r}, found {len(inner)}")

        fen_row = ""
        empty_count = 0
        for glyph in inner:
            piece = PIECE_GLYPHS.get(glyph)
            if piece:
                if empty_count:
                    fen_row += str(empty_count)
                    empty_count = 0
                fen_row += piece
            elif glyph in EMPTY_SQUARES:
                empty_count += 1
            else:
                raise ValueError(f"Unknown chess glyph {glyph!r} ({ord(glyph):04x})")
        if empty_count:
            fen_row += str(empty_count)
        fen_rows.append(fen_row)
    return "/".join(fen_rows)


def find_active_color(
    bbox: tuple[float, float, float, float],
    markers: list[TextLine],
    default: str = "w",
) -> str:
    candidates = [
        marker
        for marker in markers
        if bbox[0] <= marker.x_center <= bbox[2] and bbox[1] - 3 <= marker.y_center <= bbox[3] + 3
    ]
    if not candidates:
        return default
    marker = min(candidates, key=lambda item: abs(item.x_center - bbox[2]))
    return "b" if marker.y_center < (bbox[1] + bbox[3]) / 2 else "w"


def find_exercise_number(bbox: tuple[float, float, float, float], numbers: list[TextLine]) -> int | None:
    candidates = [
        number
        for number in numbers
        if number.x_center < bbox[0] and bbox[1] - 8 <= number.y_center <= bbox[1] + 28
    ]
    if not candidates:
        return None
    closest = min(candidates, key=lambda item: (abs(item.x_center - bbox[0]), abs(item.y_center - bbox[1])))
    return int(closest.text.strip())


def find_label(bbox: tuple[float, float, float, float], labels: list[TextLine]) -> str | None:
    candidates = [
        label
        for label in labels
        if ranges_overlap((bbox[0], bbox[2]), (label.bbox[0], label.bbox[2]))
        and bbox[1] - 36 <= label.bbox[3] <= bbox[1] + 6
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.bbox[3]).text.strip()


def is_rank_line(text: str) -> bool:
    stripped = text.rstrip("\n")
    return len(stripped) >= 10 and stripped[0] in RANK_STARTS and stripped[-1] == BOARD_END


def is_label_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped or stripped.isdigit():
        return False
    return not any(0xF000 <= ord(char) <= 0xF8FF for char in stripped)


def parse_pages(pages: str) -> Iterable[int]:
    for part in pages.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" not in part:
            yield int(part)
            continue
        start, end = [int(value.strip()) for value in part.split("-", maxsplit=1)]
        yield from range(start, end + 1)


def write_results(
    results: list[DiagramFen],
    out_dir: Path,
    book_name: str,
    pages: str,
    fen_file: Path | None = None,
    metadata: bool = False,
) -> dict[str, Path]:
    if fen_file is not None:
        fen_path = fen_file
        fen_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        safe_pages = pages.replace(",", "_").replace("-", "_")
        fen_path = out_dir / f"{book_name}_pages_{safe_pages}.fen"
    paths = {"fen": fen_path}
    safe_pages = pages.replace(",", "_").replace("-", "_")

    with fen_path.open("w", encoding="utf-8") as output:
        for result in results:
            output.write(f"{result.fen}\n")

    if metadata:
        jsonl_path = fen_path.with_suffix(".jsonl") if fen_file is not None else out_dir / f"{book_name}_pages_{safe_pages}.jsonl"
        with jsonl_path.open("w", encoding="utf-8") as jsonl_file:
            for result in results:
                jsonl_file.write(json.dumps(asdict(result), ensure_ascii=False) + "\n")
        paths["jsonl"] = jsonl_path

    return paths


def union_bbox(boxes: Iterable[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    boxes = list(boxes)
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def round_bbox(bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return tuple(round(value, 2) for value in bbox)


def ranges_overlap(first: tuple[float, float], second: tuple[float, float]) -> bool:
    return max(first[0], second[0]) <= min(first[1], second[1])


def find_board_number_hint(rows: list[TextLine]) -> int:
    return int(rows[0].bbox[0] * 1000 + rows[0].bbox[1])
