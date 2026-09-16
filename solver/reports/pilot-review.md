# Encyclopedia solution-tree pilot review

The final ten-position sample contains **4 automatically resolved trees and 6 trees requiring review**. All ten first moves agree with the independent deeper reference. A generated tree is not automatically a completed or verified solution: `needs_review` is a meaningful result, and these cases must not be reported as fully solved.

This report uses the **latest generated document per puzzle** in `pilot-final.jsonl`, with puzzle #1 replaced by its targeted followup in `pilot-final-repeat-fix-1.json`, and #301/#1087 replaced by their latest generator-version-4 records in `encyclopedia-correction-v4.jsonl`. The independently generated pilot #2 is preserved here even if its production solution is subsequently edited by a user. This mixed set records the latest targeted validation, not a simultaneous rerun of all ten. Initial and rerun documents are never counted as separate positions.

## Final results

Times are per-position elapsed seconds under the actual pilot workload; they are not hardware-independent CPU benchmarks. Nodes count stored position nodes, including terminal leaves.

| Puzzle | Status | Nodes | Seconds | Accepted first move(s) | Review reasons |
| --- | --- | ---: | ---: | --- | --- |
| 1 | needs_review | 120 | 121.0 | Qxf3 | max_depth, max_seconds |
| 2 | solved | 64 | 45.7 | Qxf4 | — |
| 301 | solved | 69 | 45.9 | Nf3 | — |
| 543 | needs_review | 84 | 122.4 | Ka7 | max_seconds |
| 1087 | needs_review | 266 | 81.1 | b7 | candidate_limit, max_nodes |
| 1501 | solved | 17 | 27.1 | Nxg7 | — |
| 1801 | needs_review | 223 | 121.1 | Nxd6 | candidate_limit, max_depth, max_seconds |
| 2255 | solved | 8 | 5.5 | Nf3+ | — |
| 2530 | needs_review | 122 | 121.2 | Qxd7 | candidate_limit, max_seconds |
| 3001 | needs_review | 357 | 105.1 | Nxa2 | ambiguous_root, candidate_limit, max_depth, max_nodes |

## What the sample tests

The sample is #1, #2, #301, #543, #1087, #1501, #1801, #2255, #2530, and #3001. It spans both colors, two starts in check, dense and sparse boards, promotion opportunities, mating attacks, material conversion, and an equality tactic. It is deliberately varied, not a random sample of all 3,001 positions.

`pilot-reference.json` records independent Stockfish 19 searches: one thread, 256 MB hash, MultiPV 3, five seconds per root, with legal UCI and SAN variations, evaluation, mate, depth, nodes, and WDL. `pilot-reference-followups.json` adds targeted child-position checks and ten-second rechecks of ambiguous roots. `pilot-reference-review.md` contains the original position-by-position chess observations.

## Baseline and iterations

The original baseline skipped four positions (#1, #543, #1801, #3001) and labeled six solved. Those labels overstated completeness: #301 and #1087 contained `max_depth` leaves, #2 stopped after only two plies, and #2255 omitted the alternative king defense. Its six “solved” results are therefore not a quality benchmark.

| Iteration | Labeled solved | Needs review | What review found |
| --- | ---: | ---: | --- |
| pilot-v1 | 1 | 9 | Exposed delayed-mate branching, shallow root verification, and false alternatives. |
| pilot-v2 | 1 | 9 | Stronger roots and zero attacker mate slack; conservative stopping remained expensive. |
| pilot-v3 | 3 | 7 | Broader resolved-position stopping; inspection caught a false stop caused by a bishop-check loop in #1. |
| pilot-v4 | 6 | 4 | Exact mate-defense pruning; inspection caught omitted checking resources in #1087. |
| final, latest result per puzzle | 4 | 6 | Required checks retained; repeated solver lines pruned; #301/#1087 refreshed after the quiet anti-mate resource correction; unresolved cases remain visible. |

The final method uses adaptive candidate searches, stronger root/child verification, separate attacker and defender selection, mandatory nontrivial checking defenses, exact board-based immediate-mate handling, and explicit budget/ambiguity flags. Quiet replies that allow immediate mate can be recorded as proven trivial rather than expanded into many identical branches. Solver alternatives are interchangeable; distinct required opponent resources remain separate branches.

The later production spot-check found a quiet-defense omission in #17. Generator version 4 additionally retains every reply that prevents immediate mate when a mate-in-one threat exists after a hypothetical opponent pass. The repaired #301/#1087 documents here use that rule; details and independent correction validation are in `production-spotcheck.md`.

The targeted #1 correction matters at candidate selection as well as stopping: a reversible checking loop with a high mate score must not eliminate a nonrepeating finite-evaluation winning move before the accepted-move cluster is formed. This fixes the cause of a misleading “two sound continuations” count rather than merely shortening the tree.

## Chess findings and leaf review

- **#1:** The key is `...Qxf3`, followed by the king attack. Earlier trees stopped before `...Bxf3+`/`...Bxd1` because `...Bh3+` was counted as an independent winning continuation; it actually returned to the same position. Reference searches give `...Qxf3` about +4.70 versus `...Qxa6` about +1.05. The targeted rerun now retains the reference conversion `...Bxf3+ Kf1 Bxd1`; it still reaches depth/time limits and correctly remains `needs_review`.
- **#2:** `Qxf4` leads to forced mate. The final tree retains the important `...Bxf4`, `...gxh5`, and `...Bh6` line. After the queen-sacrifice defenses are answered, an `unavoidable_mate` endpoint is an exact board-checked claim that every legal reply permits mate in one.
- **#301:** `...Nf3` is the key. The final tree includes the checking resources `Qc7+` and `Nf5+`. Its main resolved endpoint has several genuinely distinct wins: an independent three-second check found `...Nd2` mating, `...Rxc2` above +8, and `...Nh3` above +7. This is materially different from the repeated-check false alternative in #1.
- **#543:** `...Ka7`, `...Re4`, and `...Bf4` all looked strong in the independent root searches. The position does not present a clean unique tactical cliff. A ten-second repeat kept their approximate scores at +4.24, +3.56, and +3.34. Do not infer uniqueness from the generated first-move list.
- **#1087:** `b7` is independently verified as winning. A shallow root search incorrectly gave `Be3` +6.14; an independent child search found drawing defenses. This is the strongest concrete reason for checking selected moves from their child positions. The final tree restores both `...Qh6+` and `...Qc1+`, which the earlier pilot-v4 iteration wrongly omitted (the iteration name differs from the later generator version 4). After `...Qh6+ Qxh6+ gxh6+`, a different winning king move from the original reference is an acceptable variation, not automatically an error.
- **#1501:** After `Nxg7 Rxg7 Bh6 d5`, an independent three-second MultiPV check found `h3` +5.62, `h4` +5.51, and `Bxg7` +4.94. Ending here under a “several sound winning continuations” rule is defensible even though immediate material balance alone would not explain the advantage.
- **#1801:** `Nxd6 Qxd6 Ne4` is the tactical start. A child search reduced the evaluation from the root estimate +3.42 to +2.46; this illustrates why fixed winning thresholds and short searches need caution.
- **#2255:** The two-defense mate tree is exact: `...Nf3+ gxf3 Rg6+ Kh1 Nf2#`, or `...Nf3+ Kh1 Nf2#`. Both were replayed to checkmate.
- **#2530:** `...Qxd7` answers check. Black starts materially ahead, so a positive material balance at the root cannot itself justify ending the exercise.
- **#3001:** `...Nxa2` is an equality tactic, approximately +0.13 to +0.17 in repeat reference searches. Several ordinary moves also keep near-equality. The generator must expose ambiguity rather than invent a forced-win objective.

## Verification and limits

The separate structural audit found no issues across 1,330 position nodes and 1,320 edges. It replays moves with full history and checks root and child FENs, legal UCI moves, duplicate siblings, side ownership, and nonempty roots. It exhaustively verifies 65 unavoidable-mate terminals, 2 checkmates, and 3,327 mating responses across 1,840 defensive moves. Root agreement and structural legality are necessary checks; neither proves all critical branches were discovered.

`advantage_resolved` and `equality_resolved` are engine-backed instructional stopping heuristics. They are not mathematical proofs that every legal move wins or draws. Evaluation is not material: modern Stockfish centipawns use outcome calibration, and the implementation counts pieces separately when claiming material conversion.

The finite candidate, time, node, and depth budgets intentionally produce `needs_review` when the generator cannot complete its chosen tree. Engine move ordering and evaluations can change with search depth, hash history, and CPU contention. Manual solution editing remains necessary for ambiguous or pedagogically poor examples. This pilot does **not** establish that all 3,001 generated solutions are correct or complete; the full-run totals must distinguish resolved, review-required, failed, and preserved manual solutions.

## Primary sources

- [Lichess puzzle generator](https://github.com/ornicar/lichess-puzzler/blob/master/generator/generator.py) motivates best-versus-second separation, separate mating/advantage logic, and repetition checks. It generates a main line, not a complete opponent-defense tree.
- [Lichess helper functions](https://github.com/ornicar/lichess-puzzler/blob/master/generator/util.py) show MultiPV comparison, an evaluation-to-winning-chance heuristic, and separate material counting.
- [Stockfish MultiPV documentation and measurements](https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html#elo-cost-of-using-multipv) explain why wide searches cost strength at a fixed time budget.
- [Stockfish WDL model](https://github.com/official-stockfish/WDL_model) explains normalized centipawn calibration; these scores are not literal pawn material.
- [Stockfish UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html) documents search budgets, MultiPV, restricted root moves, and using move history for repetition handling.
