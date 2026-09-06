from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


FENS = [
    "4r1k1/p1pb1ppp/Qbp1r3/8/1P6/2Pq1B2/R2P1PPP/2B2RK1",
    "4r1k1/p1qr1p2/2pb1Bp1/1p5p/3P1n1R/3B1P2/PP3PK1/2Q4R",
    "r1b1r1k1/pp1nqp2/2p1p1pp/8/4N3/P1Q1P3/1P3PPP/1BRR2K1",
]
BOXES = [(130, 1222, 601, 1698), (694, 1222, 1167, 1698), (1260, 1220, 1731, 1698)]


def expand(fen: str) -> str:
    return "".join("." * int(c) if c.isdigit() else c for c in fen.replace("/", ""))


def cells(image: np.ndarray, box: tuple[int, int, int, int]):
    x0, y0, x1, y1 = box
    xs = np.linspace(x0, x1, 9)
    ys = np.linspace(y0, y1, 9)
    for rank in range(8):
        for file in range(8):
            # Strip grid lines and normalize each square to 48x48.
            crop = image[
                round(ys[rank]) + 5 : round(ys[rank + 1]) - 5,
                round(xs[file]) + 5 : round(xs[file + 1]) - 5,
            ]
            normalized = Image.fromarray(crop).point(lambda value: 0 if value < 128 else 255)
            # Remove the tiny screened dots used for dark squares while retaining piece strokes.
            ink = normalized.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
            yield np.asarray(ink.resize((48, 48), Image.Resampling.NEAREST)) < 128


def main():
    image = np.asarray(Image.open(Path(__file__).with_name("page-012.png")).convert("L"))
    examples = []
    for board, fen in zip(BOXES, FENS):
        for i, (pixel, piece) in enumerate(zip(cells(image, board), expand(fen))):
            examples.append((piece, i % 2 ^ i // 8 % 2, pixel))

    # Background templates for each square shade, then isolate piece ink changes.
    bg = {}
    for shade in (0, 1):
        empty = [p for c, s, p in examples if c == "." and s == shade]
        bg[shade] = np.median(empty, axis=0)
    signatures = [(n, c, s, p) for n, (c, s, p) in enumerate(examples)]

    for c in "KQRBNPkqrbnp":
        counts = [int(sig.sum()) for _, label, _, sig in signatures if label == c]
        print(c, len(counts), min(counts), round(sum(counts) / len(counts)), max(counts))

    errors = []
    for n, (expected, shade, pixel) in enumerate(examples):
        sig = pixel
        choices = []
        # Leave the exact square out; evaluate whether same-piece templates generalize.
        for source_n, label, other_shade, template in signatures:
            if source_n == n:
                continue
            if label == "." or label.isupper() != (sig.sum() < 400):
                continue
            best = 0.0
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    shifted = np.zeros_like(template)
                    sy0, sy1 = max(0, -dy), min(48, 48 - dy)
                    sx0, sx1 = max(0, -dx), min(48, 48 - dx)
                    shifted[sy0 + dy : sy1 + dy, sx0 + dx : sx1 + dx] = template[sy0:sy1, sx0:sx1]
                    overlap = np.logical_and(sig, shifted).sum()
                    best = max(best, 2 * overlap / max(1, sig.sum() + shifted.sum()))
            choices.append((-best, label))
        predicted = "." if sig.sum() < 15 else min(choices)[1]
        if predicted != expected:
            errors.append((n // 64 + 1, n % 64, expected, predicted, int(sig.sum()), sorted(choices)[:3]))
    print("errors", len(errors))
    print(*errors[:30], sep="\n")


if __name__ == "__main__":
    main()
