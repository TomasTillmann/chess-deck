# Encyclopedia pilot: independent reference review

Reference: `pilot-reference.json`. Stockfish 19, one thread, 256 MB hash, MultiPV 3, five seconds per position. Scores are from the original side-to-move perspective. All recorded PV moves were replayed and checked for legality. `pilot-reference-followups.json` records extra independent child searches and repeated ambiguous-root searches. This is a reference sample, not a proof of complete solution trees.

| Puzzle | Best first move | Root score | Nearest alternative | Interpretation |
| --- | --- | --- | --- | --- |
| 1 | ...Qxf3 | +4.70 | ...Qxa6 +1.05 | Queen sacrifice exposes the white king: ...Qxf3 gxf3 Rg6+ Kh1 Bh3. The attack must continue beyond the sacrifice. |
| 2 | Qxf4 | Mate in 6 | Rxf4 -5.88 | Escape check by sacrificing the queen; rook sacrifices open the h-file. Reference line reaches actual mate. |
| 301 | ...Nf3 | +9.69 | ...Rxc2 -0.53 | A knight move creates a mating threat while retaining the attack on the white queen. White has checking resources, including Qc7+. |
| 543 | ...Ka7 | +4.11 | ...Re4 +3.53, ...Bf4 +3.05 | Several winning-looking moves; no unique tactical cliff. A ten-second repeat gives +4.24/+3.56/+3.34. Requires caution about root ambiguity. |
| 1087 | b7 | +11.59 | Be3 initially +6.14 | Connected passed pawns support promotion. The apparent Be3 alternative is a false positive: independent child analysis finds ...R3d6 at -0.02 and two other drawing replies. |
| 1501 | Nxg7 | +5.85 | Rxf7 +1.60 | After ...Rxg7, Bh6 attacks the rook with threats against the king. The child search gives Bh6 +4.57; Bd4 +3.02 is another useful continuation to inspect. |
| 1801 | Nxd6 | +3.42 | Bg5+ +0.83 | After ...Qxd6, Ne4 attacks the queen and continues the combination. Independent child search gives Ne4 +2.46, so a hard +3.00 terminal threshold may be too strict here. |
| 2255 | ...Nf3+ | Mate in 3 | ...Nb3 -2.20 | Two legal defenses need distinct finishes: gxf3 Rg6+ Kh1 Nf2#; Kh1 Nf2#. Both mates were checked on the board. |
| 2530 | ...Qxd7 | +8.79 | ...Kg8 +3.63 | Answer check by capturing the knight; Qd4, ...Rxb2+, and ...Bf6 belong to the tactical continuation. Black begins materially ahead, so root material balance alone cannot justify stopping. |
| 3001 | ...Nxa2 | +0.17 | ...h5 -0.39 | Equality tactic, not a forced win. The knight capture and ...Rc2 recover material. Ten-second repeat confirms ...Nxa2 +0.13. |

## What the generator must demonstrate on this sample

- Nonempty legal trees for every analyzable root; no root declared resolved before a move is made.
- Selected moves checked from the child position, especially when root MultiPV returns a short PV or implausible score. Puzzle 1087 is a concrete regression for this.
- Explicit distinction between checkmate, stable conversion, repetition/draw, ambiguous root, and budget exhaustion.
- More than one relevant opponent branch where appropriate. Puzzle 2255 provides a tiny exact mating tree.
- Evaluation and actual material counted separately. Winning evaluation is not itself proof that a sacrifice has resolved.
- No termination while the solving side is in check, and no termination immediately after collecting material if a forced recapture follows.
- No automatic failure for an equality tactic. Puzzle 3001 should receive draw-aware handling or an explicit needs-review outcome.
- Adding extra user branches leaves the score unchanged; removing a required defense or substituting a wrong critical continuation lowers it.
- Deeper verification should preserve selected tactical moves. Changes in equivalent-move order are less concerning than a win-to-draw change.

Some reported engine PVs stop after one or two plies despite substantial search depth. They are legal but insufficient explanations on their own; the followup searches expand key examples. Time-limited searches can also finish with different candidate depths. The sample does not justify calling all 3,001 trees verified.

## Primary sources behind the approach

- [Lichess puzzle generator](https://github.com/ornicar/lichess-puzzler/blob/master/generator/generator.py): uses best-versus-second comparisons, separate mate/advantage handling, and repetition checks. Its output is one main line, so additional defense-tree logic is needed here.
- [Lichess helper functions](https://github.com/ornicar/lichess-puzzler/blob/master/generator/util.py): MultiPV 2, a winning-chance transform, and a separate material count.
- [Stockfish MultiPV cost](https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html#elo-cost-of-using-multipv): larger MultiPV reduces best-move search quality at a fixed time budget.
- [Stockfish WDL model](https://github.com/official-stockfish/WDL_model): modern normalized centipawns are calibrated to engine self-play outcomes, not literal pawn material.
- [Stockfish UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html): MultiPV, restricted root moves, search budgets, and preserving move history for repetition handling.
