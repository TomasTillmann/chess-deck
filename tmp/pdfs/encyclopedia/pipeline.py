from __future__ import annotations

from pathlib import Path
import json
import re
import subprocess
import sys

import fitz
import chess
import numpy as np
from PIL import Image, ImageFilter


PDF = Path("/Users/tomastillmann/Downloads/pdfcoffee.com_encyclopedia-of-chess-combinations-4th-ed-2-pdf-free.pdf")
REFERENCE_ARCHIVE = Path("/tmp/anthology_of_chess_combinations_3.rar")
X_EDGE_WINDOWS = ((90, 180, 550, 640), (650, 750, 1110, 1210), (1210, 1310, 1680, 1780))
PAGE_RANGES = (
    (12, 36), (54, 56), (59, 63), (67, 73), (77, 129), (174, 178), (183, 194),
    (204, 228), (244, 247), (250, 256), (261, 274), (285, 286), (288, 290),
    (292, 298), (304, 310), (314, 374), (426, 429), (433, 440), (448, 510),
    (555, 564), (572, 584), (593, 600), (605, 606), (608, 610), (613, 616),
    (618, 620),
)
BASELINE = (
    "4r1k1/p1pb1ppp/Qbp1r3/8/1P6/2Pq1B2/R2P1PPP/2B2RK1 b - - 0 1",
    "4r1k1/p1qr1p2/2pb1Bp1/1p5p/3P1n1R/3B1P2/PP3PK1/2Q4R w - - 0 1",
    "r1b1r1k1/pp1nqp2/2p1p1pp/8/4N3/P1Q1P3/1P3PPP/1BRR2K1 w - - 0 1",
)
CALIBRATION_PLACEMENTS = tuple(fen.split()[0] for fen in BASELINE) + (
    "4Rbk1/5p2/1p1N3p/p5p1/5q2/Q6P/PPr5/3R3K",
    "4r3/p2qppkp/3p2b1/1p1N4/2r1P1RQ/2P4P/PP4P1/5RK1",
    "1rr3k1/4ppb1/2q1bnp1/1p2B1Q1/6P1/2p2P2/P1P1B2R/2K4R",
)
MANUAL_AUDIT = {
    168: "rn5r/6kp/p2R1bp1/3P2N1/1pq5/6Q1/PPP2PPP/2K4R w - - 0 1",
    195: "r1bqr1k1/pp3nbp/3Pp1p1/8/3pN3/8/PP2B1PP/R1BQ1R1K w - - 0 1",
    693: "rnbq1r1k/5ppB/1p2pn1p/p1bp2N1/2P5/PP2P3/1BQN1PPP/R3K2R w - - 0 1",
    903: "2b1k3/pp2bp2/2p5/2p1PP1p/4K3/P1B1N1rP/1PP5/3R4 w - - 0 1",
    1111: "kn3qr1/1pR1bp2/pP2r2p/Q2R1p2/3P1B2/P4NP1/6K1/8 w - - 0 1",
    1138: "3r3r/1p3k1p/p1n2pp1/q2pn3/5B2/4Q1P1/1P2PPBP/2RR2K1 w - - 0 1",
    1230: "4r1k1/qp3p1p/2p1b1p1/p6n/N2rPP2/P5PP/1PQ3BK/R2R4 b - - 0 1",
    1954: "b3q1k1/5r1p/6pB/2bp4/2nN4/6Q1/5PPP/1B1R2K1 w - - 0 1",
    2054: "1r4k1/2p5/2p4p/p1qbQ1p1/PrNp2P1/1P1P3P/1KP5/R3R3 b - - 0 1",
    2543: "r3k2r/1pp3pp/p1pb2q1/4N3/6b1/3P4/PPPNQPK1/R1B4R b - - 0 1",
    2617: "1R4r1/3k1p2/p1r1p3/2p1Pp2/R4Pq1/2P4p/P4QPP/6K1 w - - 0 1",
    2627: "r3r1k1/1q1b1ppp/1p3n2/2b5/2P2B2/5NP1/1RQ1BP1P/4R1K1 b - - 0 1",
    2631: "4kb1r/1p1q1ppp/p3p3/3n1b2/3PNB2/5N2/PP2QPPP/2R3K1 w - - 0 1",
    2633: "4r2k/2p3b1/1p4p1/7p/1NPp4/3P1pPb/2N1qP1P/QR4KB b - - 0 1",
    2644: "6k1/5p1R/p5p1/2p1b3/2pr4/2q2PP1/P3Q1K1/7R w - - 0 1",
    2828: "3q1r2/p1k4r/npBp1p1P/2pPp1p1/2P1P1Q1/P1P2RP1/5R1P/6K1 w - - 0 1",
    2829: "2k2rnr/p2q3p/2pb2p1/2p5/3p2P1/3P1QNP/PPP5/R1B2RK1 w - - 0 1",
    2830: "q1r1r2k/3n1pp1/3p3p/1p1Pp3/1P2PPn1/6P1/2BBR1P1/R5QK b - - 0 1",
}


def groups(values: np.ndarray) -> list[np.ndarray]:
    return [group for group in np.split(values, np.where(np.diff(values) > 1)[0] + 1) if len(group)]


def merge_close(values: list[int], distance: int = 8) -> list[int]:
    merged: list[list[int]] = []
    for value in sorted(values):
        if not merged or value - merged[-1][-1] > distance:
            merged.append([])
        merged[-1].append(value)
    return [round(sum(group) / len(group)) for group in merged]


def page_image(page: fitz.Page) -> np.ndarray:
    pixmap = page.get_pixmap(dpi=600, colorspace=fitz.csGRAY, alpha=False)
    return np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width)


def find_board_guesses(page: fitz.Page) -> list[tuple[int, int]]:
    pixmap = page.get_pixmap(dpi=75, colorspace=fitz.csGRAY, alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width) < 160
    guesses: list[tuple[int, int]] = []
    for x in (30, 172, 313):
        candidates = []
        for y in range(70, 571):
            score = (
                image[max(0, y - 4) : y + 5, x - 4 : x + 123].any(0).sum()
                + image[y + 113 : y + 122, x - 4 : x + 123].any(0).sum()
                + image[y - 4 : y + 123, max(0, x - 4) : x + 5].any(1).sum()
                + image[y - 4 : y + 123, x + 113 : x + 122].any(1).sum()
            )
            if score >= 420:
                candidates.append(y)
        for group in np.split(candidates, np.where(np.diff(candidates) > 12)[0] + 1):
            if len(group):
                guesses.append((x, round(float(np.mean(group)))))
    rows: list[list[tuple[int, int]]] = []
    for guess in sorted(guesses, key=lambda item: item[1]):
        if not rows or guess[1] - rows[-1][0][1] > 12:
            rows.append([])
        rows[-1].append(guess)
    return [guess for row in rows for guess in sorted(row)]


def peak_center(scores: np.ndarray, offset: int) -> int:
    candidates = np.where(scores >= scores.max() * 0.9)[0]
    winner = int(np.argmax(scores))
    group = next(group for group in groups(candidates) if group[0] <= winner <= group[-1])
    return offset + round(float(group.mean()))


def refine_board(image: np.ndarray, guess: tuple[int, int]) -> tuple[int, int, int, int]:
    ink = image < 128
    x, y = (value * 8 for value in guess)
    nominal_right = x + 117 * 8
    nominal_bottom = y + 117 * 8
    top = peak_center(ink[y - 50 : y + 51, x - 30 : nominal_right + 70].sum(1), y - 50)
    bottom = peak_center(
        ink[nominal_bottom - 50 : nominal_bottom + 51, x - 30 : nominal_right + 70].sum(1),
        nominal_bottom - 50,
    )
    left = peak_center(ink[top - 20 : bottom + 21, x - 50 : x + 81].sum(0), x - 50)
    right = peak_center(
        ink[top - 20 : bottom + 21, nominal_right - 50 : nominal_right + 81].sum(0),
        nominal_right - 50,
    )
    return left, top, right, bottom


def find_boards(page: fitz.Page, image: np.ndarray) -> list[tuple[int, int, int, int]]:
    return [refine_board(image, guess) for guess in find_board_guesses(page)]


def old_find_boards(image: np.ndarray) -> list[tuple[int, int, int, int]]:
    ink = image < 128
    found: list[tuple[int, int, int, int]] = []
    for lx0, lx1, rx0, rx1 in X_EDGE_WINDOWS:
        # Full board borders have far more ink than any ordinary diagram row.
        x0, x1 = lx0, rx1
        score = ink[:, x0:x1].sum(axis=1)
        lines = merge_close([int(round(group.mean())) for group in groups(np.where(score > 340)[0])])
        for top in lines:
            bottoms = [line for line in lines if 450 <= line - top <= 500]
            if not bottoms:
                continue
            bottom = min(bottoms, key=lambda line: abs(line - top - 470))
            vertical = ink[top : bottom + 1].sum(axis=0)
            left = int(lx0 + np.argmax(vertical[lx0:lx1]))
            right = int(rx0 + np.argmax(vertical[rx0:rx1]))
            if 450 <= right - left <= 490:
                found.append((left, top, right, bottom))
    rows: list[list[tuple[int, int, int, int]]] = []
    for box in sorted(set(found), key=lambda item: item[1]):
        if not rows or box[1] - rows[-1][0][1] > 20:
            rows.append([])
        rows[-1].append(box)
    return [box for row in rows for box in sorted(row)]


def expand(placement: str) -> str:
    return "".join("." * int(char) if char.isdigit() else char for char in placement.replace("/", ""))


def compress(pieces: str) -> str:
    rows = []
    for start in range(0, 64, 8):
        row, empty = "", 0
        for piece in pieces[start : start + 8]:
            if piece == ".":
                empty += 1
            else:
                row += (str(empty) if empty else "") + piece
                empty = 0
        rows.append(row + (str(empty) if empty else ""))
    return "/".join(rows)


def board_features(image: np.ndarray, box: tuple[int, int, int, int]) -> list[np.ndarray]:
    left, top, right, bottom = box
    xs = np.linspace(left, right, 9)
    ys = np.linspace(top, bottom, 9)
    features = []
    for rank in range(8):
        for file in range(8):
            x0, x1 = round(xs[file]), round(xs[file + 1])
            y0, y1 = round(ys[rank]), round(ys[rank + 1])
            margin = round(min(x1 - x0, y1 - y0) * 0.12)
            crop = Image.fromarray(image[y0 + margin : y1 - margin, x0 + margin : x1 - margin])
            ink = crop.point(lambda value: 0 if value < 128 else 255)
            ink = np.asarray(ink.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))) < 128
            ys_ink, xs_ink = np.where(ink)
            if len(xs_ink) < 80:
                features.append(np.zeros((48, 48), dtype=bool))
                continue
            features.append(np.asarray(Image.fromarray(ink).resize((48, 48), Image.Resampling.NEAREST)))
    return features


def similarity(first: np.ndarray, second: np.ndarray) -> float:
    overlap = np.logical_and(first, second).sum()
    return 2 * overlap / max(1, first.sum() + second.sum())


def templates(features: list[list[np.ndarray]]) -> list[tuple[str, np.ndarray]]:
    return [
        (piece, feature)
        for placement, board in zip(CALIBRATION_PLACEMENTS, features)
        for piece, feature in zip(expand(placement), board)
        if piece != "."
    ]


def compile_bank(bank: list[tuple[str, np.ndarray]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    labels = np.asarray([piece for piece, _ in bank])
    masks = np.stack([mask for _, mask in bank])
    return labels, masks, masks.sum(axis=(1, 2))


def compile_centroids(bank: list[tuple[str, np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    labels = np.asarray(list("KQRBNPkqrbnp"))
    centroids = np.stack(
        [np.mean([mask for piece, mask in bank if piece == label], axis=0) for label in labels]
    )
    return labels, centroids


def classify_centroid(
    features: list[np.ndarray], model: tuple[np.ndarray, np.ndarray]
) -> tuple[str, list[float]]:
    labels, all_centroids = model
    pieces, margins = [], []
    for index, feature in enumerate(features):
        ink = int(feature.sum())
        if ink < 12:
            pieces.append(".")
            margins.append(1.0)
            continue
        parity = (index // 8 + index % 8) % 2
        centroids = all_centroids[parity] if all_centroids.ndim == 4 else all_centroids
        norms = np.sqrt((centroids * centroids).sum(axis=(1, 2)))
        scores = (centroids * feature).sum(axis=(1, 2)) / (norms * np.sqrt(ink))
        order = np.argsort(scores)
        pieces.append(str(labels[order[-1]]))
        margins.append(float(scores[order[-1]] - scores[order[-2]]))
    return compress("".join(pieces)), margins


def silhouette_mask(mask: np.ndarray) -> np.ndarray:
    left = np.maximum.accumulate(mask, axis=1)
    right = np.maximum.accumulate(mask[:, ::-1], axis=1)[:, ::-1]
    return np.logical_or(mask, np.logical_and(left, right))


def classify_structured(
    features: list[np.ndarray], model: tuple[np.ndarray, np.ndarray, np.ndarray]
) -> tuple[str, list[float]]:
    labels, all_centroids, color_thresholds = model
    pieces, margins = [], []
    for index, feature in enumerate(features):
        ink = int(feature.sum())
        if ink < 12:
            pieces.append(".")
            margins.append(1.0)
            continue
        parity = (index // 8 + index % 8) % 2
        centroids = all_centroids[parity]
        query = silhouette_mask(feature)
        norms = np.sqrt((centroids * centroids).sum(axis=(1, 2)))
        scores = (centroids * query).sum(axis=(1, 2)) / (norms * np.sqrt(query.sum()))
        order = np.argsort(scores)
        type_index = int(order[-1])
        piece = str(labels[type_index])
        pieces.append(piece.upper() if ink < color_thresholds[parity, type_index] else piece)
        margins.append(float(scores[order[-1]] - scores[order[-2]]))
    return compress("".join(pieces)), margins


def classify_color_first(
    features: list[np.ndarray],
    model: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, bool],
) -> tuple[str, list[float]]:
    labels, masks, sums, global_thresholds, type_thresholds, refine = model
    lower_labels = np.char.lower(labels)
    upper_labels = np.char.isupper(labels)
    pieces, margins = [], []
    for index, feature in enumerate(features):
        ink = int(feature.sum())
        if ink < 12:
            pieces.append(".")
            margins.append(1.0)
            continue
        parity = (index // 8 + index % 8) % 2
        white = ink < global_thresholds[parity]
        scores = 2 * np.logical_and(masks, feature).sum(axis=(1, 2)) / (sums + ink)

        def winner_for(color: bool) -> int:
            return int(np.argmax(np.where(upper_labels == color, scores, -1.0)))

        winner = winner_for(white)
        type_index = "kqrbnp".index(str(lower_labels[winner]))
        if refine:
            white = ink < type_thresholds[parity, type_index]
            winner = winner_for(white)
        alternatives = (upper_labels == white) & (lower_labels != lower_labels[winner])
        pieces.append(str(labels[winner]))
        margins.append(float(scores[winner] - scores[alternatives].max()))
    return compress("".join(pieces)), margins


def classify_hybrid(
    features: list[np.ndarray],
    model: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray],
) -> tuple[str, list[float]]:
    labels, masks, sums, color_thresholds = model
    types = np.asarray(list("kqrbnp"))
    lower_labels = np.char.lower(labels)
    pieces, margins = [], []
    for index, feature in enumerate(features):
        ink = int(feature.sum())
        if ink < 12:
            pieces.append(".")
            margins.append(1.0)
            continue
        parity = (index // 8 + index % 8) % 2
        scores = 2 * np.logical_and(masks, feature).sum(axis=(1, 2)) / (sums + ink)
        type_scores = np.asarray([scores[lower_labels == piece].max() for piece in types])
        order = np.argsort(type_scores)
        type_index = int(order[-1])
        piece = str(types[type_index])
        pieces.append(piece.upper() if ink < color_thresholds[parity, type_index] else piece)
        margins.append(float(type_scores[order[-1]] - type_scores[order[-2]]))
    return compress("".join(pieces)), margins


def classify_board(
    features: list[np.ndarray], bank: tuple[np.ndarray, np.ndarray, np.ndarray]
) -> tuple[str, list[float]]:
    labels, masks, sums = bank
    pieces, margins = [], []
    for feature in features:
        ink = int(feature.sum())
        if ink < 12:
            pieces.append(".")
            margins.append(1.0)
            continue
        scores = 2 * np.logical_and(masks, feature).sum(axis=(1, 2)) / (sums + ink)
        winner = int(np.argmax(scores))
        piece = str(labels[winner])
        best = float(scores[winner])
        second = float(scores[labels != piece].max())
        pieces.append(piece)
        margins.append(best - second)
    return compress("".join(pieces)), margins


def marker_width(image: np.ndarray, box: tuple[int, int, int, int]) -> int:
    left, _, _, bottom = box
    region = image[bottom + 20 : bottom + 100, left + 20 : left + 220] < 128
    ys, xs = np.where(region)
    return int(xs.max() - xs.min())


def load_reference() -> list[str]:
    if not REFERENCE_ARCHIVE.exists():
        return []
    pgn = subprocess.check_output(
        ["bsdtar", "-xOf", str(REFERENCE_ARCHIVE), "Anthology of Chess Combinations 3.PGN"]
    ).decode("utf-8", errors="replace")
    return [
        f"{parts[0]} {parts[1]} - - 0 1"
        for fen in re.findall(r'\[FEN "([^"]+)"\]', pgn)
        for parts in [fen.split()]
    ]


def reference_match(
    placement: str, references: list[str], reference_pieces: np.ndarray, maximum: int = 6
) -> tuple[int | None, int]:
    query = np.frombuffer(expand(placement).encode("ascii"), dtype=np.uint8)
    distances = np.count_nonzero(reference_pieces != query, axis=1)
    winner = int(np.argmin(distances))
    distance = int(distances[winner])
    return (winner if distance <= maximum else None), distance


def add_training(
    selected: dict[str, list[np.ndarray]], features: list[np.ndarray], placement: str, limit: int = 64
) -> None:
    for piece, feature in zip(expand(placement), features):
        if piece == "." or len(selected[piece]) >= limit:
            continue
        if not selected[piece] or max(similarity(feature, old) for old in selected[piece]) < 0.995:
            selected[piece].append(feature)


def best_side_threshold(samples: list[tuple[int, str]]) -> tuple[int, int]:
    best = (10**9, 105)
    for threshold in range(70, 151):
        errors = sum(("b" if width > threshold else "w") != side for width, side in samples)
        best = min(best, (errors, threshold))
    return best[1], best[0]


def best_color_threshold(samples: list[tuple[int, bool]]) -> tuple[int, int]:
    best = (10**9, 625)
    for threshold in range(50, 1401):
        errors = sum((ink < threshold) != white for ink, white in samples)
        best = min(best, (errors, threshold))
    return best[1], best[0]


def extract_all(document: fitz.Document, initial_bank: list[tuple[str, np.ndarray]], out_dir: Path) -> None:
    references = load_reference()
    reference_pieces = np.stack(
        [np.frombuffer(expand(fen.split()[0]).encode("ascii"), dtype=np.uint8) for fen in references]
    )
    bank = compile_bank(initial_bank)
    selected = {piece: [] for piece in "KQRBNPkqrbnp"}
    centroid_sums = {
        (piece, parity): np.zeros((48, 48), dtype=np.float64)
        for piece in selected
        for parity in (0, 1)
    }
    centroid_counts = {(piece, parity): 0 for piece in selected for parity in (0, 1)}
    type_sums = {
        (piece, parity): np.zeros((48, 48), dtype=np.float64)
        for piece in "kqrbnp"
        for parity in (0, 1)
    }
    type_counts = {(piece, parity): 0 for piece in "kqrbnp" for parity in (0, 1)}
    color_samples = {
        (piece, parity): [] for piece in "kqrbnp" for parity in (0, 1)
    }
    held_out: list[tuple[list[np.ndarray], str]] = []
    for piece, feature in initial_bank:
        add_training(selected, [feature], piece + "." * 63)
    records, unmatched, side_samples = [], [], []
    puzzle = 0
    for start, end in PAGE_RANGES:
        for number in range(start, end + 1):
            image = page_image(document[number - 1])
            boxes = find_boards(document[number - 1], image)
            for box in boxes:
                puzzle += 1
                features = board_features(image, box)
                placement, margins = classify_board(features, bank)
                width = marker_width(image, box)
                match, distance = reference_match(placement, references, reference_pieces)
                record = {
                    "puzzle": puzzle,
                    "page": number,
                    "placement": placement,
                    "marker_width": width,
                    "margin": min(margins),
                    "reference_distance": distance,
                }
                if match is not None:
                    fen = references[match]
                    record["reference"] = match + 1
                    record["fen"] = fen
                    side_samples.append((width, fen.split()[1]))
                    add_training(selected, features, fen.split()[0])
                    if puzzle % 23 == 0 and len(held_out) < 120:
                        held_out.append((features, fen.split()[0]))
                    else:
                        for square, (piece, feature) in enumerate(zip(expand(fen.split()[0]), features)):
                            if piece != ".":
                                key = (piece, (square // 8 + square % 8) % 2)
                                centroid_sums[key] += feature
                                centroid_counts[key] += 1
                                parity = key[1]
                                type_key = (piece.lower(), parity)
                                type_sums[type_key] += silhouette_mask(feature)
                                type_counts[type_key] += 1
                                color_samples[piece.lower(), parity].append(
                                    (int(feature.sum()), piece.isupper())
                                )
                else:
                    record["features"] = features
                    unmatched.append(record)
                records.append(record)
            print(f"page {number}: {len(boxes)} boards; total {puzzle}", flush=True)

    if puzzle != 3001:
        raise RuntimeError(f"Expected 3001 boards, detected {puzzle}")

    expanded_bank = compile_bank(
        [(piece, feature) for piece, choices in selected.items() for feature in choices]
    )
    centroid_model = (
        np.asarray(list("KQRBNPkqrbnp")),
        np.stack(
            [
                np.stack(
                    [centroid_sums[piece, parity] / centroid_counts[piece, parity] for piece in "KQRBNPkqrbnp"]
                )
                for parity in (0, 1)
            ]
        ),
    )
    color_results = [
        [best_color_threshold(color_samples[piece, parity]) for piece in "kqrbnp"]
        for parity in (0, 1)
    ]
    global_color_results = [
        best_color_threshold(
            [sample for piece in "kqrbnp" for sample in color_samples[piece, parity]]
        )
        for parity in (0, 1)
    ]
    structured_model = (
        np.asarray(list("kqrbnp")),
        np.stack(
            [
                np.stack(
                    [type_sums[piece, parity] / type_counts[piece, parity] for piece in "kqrbnp"]
                )
                for parity in (0, 1)
            ]
        ),
        np.asarray([[result[0] for result in row] for row in color_results]),
    )
    print(
        f"COLOR thresholds={structured_model[2].tolist()} "
        f"training_errors={[[result[1] for result in row] for row in color_results]} "
        f"global={global_color_results}"
    )
    color_model = (
        *expanded_bank,
        np.asarray([result[0] for result in global_color_results]),
        structured_model[2],
        False,
    )
    refined_color_model = (*color_model[:-1], True)
    hybrid_model = (*expanded_bank, structured_model[2])
    classifiers = (
        ("templates", expanded_bank, classify_board),
        ("centroids", centroid_model, classify_centroid),
        ("structured", structured_model, classify_structured),
        ("color_first", color_model, classify_color_first),
        ("color_refined", refined_color_model, classify_color_first),
        ("hybrid", hybrid_model, classify_hybrid),
    )
    ranked = []
    for name, model, classify in classifiers:
        right = total = exact = 0
        confusion: dict[str, int] = {}
        for features, truth in held_out:
            predicted = expand(classify(features, model)[0])
            expected = expand(truth)
            right += sum(a == b for a, b in zip(predicted, expected))
            exact += predicted == expected
            for actual, guessed in zip(expected, predicted):
                if actual != guessed:
                    key = f"{actual}>{guessed}"
                    confusion[key] = confusion.get(key, 0) + 1
            total += 64
        print(
            f"HELD_OUT {name} squares={right}/{total} boards={exact}/{len(held_out)} "
            f"accuracy={right/total:.6f} errors={confusion}",
            flush=True,
        )
        ranked.append((exact, right, name, model, classify))
    _, _, production_name, production_model, production_classifier = max(ranked)
    print(f"PRODUCTION classifier={production_name}", flush=True)
    for record in unmatched:
        features = record.pop("features")
        placement, margins = production_classifier(features, production_model)
        template_placement, template_margins = classify_board(features, expanded_bank)
        record["template_placement"] = template_placement
        record["classifier_agreement"] = placement == template_placement
        match, distance = reference_match(placement, references, reference_pieces)
        template_match, template_distance = reference_match(
            template_placement, references, reference_pieces
        )
        side = "b" if record["marker_width"] > 105 else "w"
        centroid_valid = chess.Board(f"{placement} {side} - - 0 1").is_valid()
        template_valid = chess.Board(f"{template_placement} {side} - - 0 1").is_valid()
        if match is None and template_match is not None:
            placement, margins, match, distance = (
                template_placement,
                template_margins,
                template_match,
                template_distance,
            )
        elif match is None and not centroid_valid and template_valid:
            placement, margins, distance = template_placement, template_margins, template_distance
        record["placement"] = placement
        record["margin"] = min(margins)
        record["reference_distance"] = distance
        if match is not None:
            record["reference"] = match + 1
            record["fen"] = references[match]
            side_samples.append((record["marker_width"], record["fen"].split()[1]))

    side_threshold, side_errors = best_side_threshold(side_samples)
    for record in records:
        if "fen" not in record:
            side = "b" if record["marker_width"] > side_threshold else "w"
            record["fen"] = f"{record['placement']} {side} - - 0 1"
        if record["puzzle"] in MANUAL_AUDIT:
            record["fen"] = MANUAL_AUDIT[record["puzzle"]]
            record["manual"] = True
        record["valid"] = chess.Board(record["fen"]).is_valid()

    matched = sum("reference" in record for record in records)
    invalid = [record for record in records if not record["valid"]]
    print(
        f"RESULT total={len(records)} reference_matches={matched} unmatched={len(records)-matched} "
        f"invalid={len(invalid)} side_threshold={side_threshold} side_training_errors={side_errors}",
        flush=True,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "encyclopedia.fen").write_text(
        "\n".join(record["fen"] for record in records) + "\n", encoding="utf-8"
    )
    serializable = [{key: value for key, value in record.items() if key != "placement"} for record in records]
    (out_dir / "encyclopedia.jsonl").write_text(
        "\n".join(json.dumps(record) for record in serializable) + "\n", encoding="utf-8"
    )
    (out_dir / "invalid.json").write_text(json.dumps(invalid, indent=2), encoding="utf-8")


def main() -> None:
    scan = sys.argv[1:] == ["--scan"]
    extract = len(sys.argv) == 3 and sys.argv[1] == "--extract"
    pages = (
        [page for start, end in PAGE_RANGES for page in range(start, end + 1)]
        if scan or extract
        else ([int(arg) for arg in sys.argv[1:]] or [12, 13, 36, 54, 77, 78, 620])
    )
    total = 0
    with fitz.open(PDF) as document:
        calibration_image = page_image(document[11])
        calibration_boxes = find_boards(document[11], calibration_image)
        calibration_features = [board_features(calibration_image, box) for box in calibration_boxes]
        raw_bank = templates(calibration_features)
        bank = compile_bank(raw_bank)
        extracted_baseline = [
            f"{classify_board(features, bank)[0]} {'b' if marker_width(calibration_image, box) > 105 else 'w'} - - 0 1"
            for box, features in zip(calibration_boxes[:3], calibration_features[:3])
        ]
        print("baseline", extracted_baseline)
        if tuple(extracted_baseline) != BASELINE:
            raise SystemExit("baseline mismatch")
        if extract:
            extract_all(document, raw_bank, Path(sys.argv[2]))
            return
        for number in pages:
            if scan:
                boards = find_board_guesses(document[number - 1])
            else:
                image = page_image(document[number - 1])
                boards = find_boards(document[number - 1], image)
            total += len(boards)
            if not scan:
                for index, box in enumerate(boards, 1):
                    placement, margins = classify_board(board_features(image, box), bank)
                    fen = f"{placement} {marker_side(image, box)} - - 0 1"
                    print(number, index, chess.Board(fen).is_valid(), round(min(margins), 3), fen)
            if scan and len(boards) != 9:
                print(number, len(boards), boards if not scan else "")
    print("total", total)


if __name__ == "__main__":
    main()
