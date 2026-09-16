# Faster generation: bounded quality comparison

Two shorter configurations were compared on thirteen known puzzles: #1, #2, #6, #12, #17, #301, #543, #1087, #1501, #1801, #2255, #2530, and #3001. Each batch ran twelve workers, each with one Stockfish thread. The search uses full-strength Stockfish with shorter time/depth limits; this is not an Elo-calibrated 2800–3000 engine configuration.

## Measured version-4 comparison

Times come from `benchmark-speed-summary.json`; per-puzzle means include the invocation overhead measured by the benchmark. Normal/root/verification search allowances are milliseconds. Depth is a maximum as well as the time allowance: a search stops when its first bound is reached. Batch wall time is the actual elapsed time for all thirteen positions, not a serial sum or a forecast for the complete deck.

| Profile | Normal/root/verify ms | Depth cap | Puzzle budget | 13-puzzle wall time | Mean puzzle time | Solved/review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fast | 75/1000/300 | 16 | 20 s | 20.58 s | 10.22 s | 7/6 |
| balanced | 125/1500/500 | 18 | 30 s | 30.88 s | 16.15 s | 8/5 |

Both profiles retained all thirteen first moves from the existing independent deeper references. They rejected the known false `Be3` alternative in #1087, kept its `...Qh6+` and `...Qc1+` checks, retained all five #17 anti-mate defenses, and preserved both exact mating branches in #2255. Fast #12 also retains `...Ra7` and `...Rc8`, the strongest defenses from the earlier child-position reference. Neither profile produced a heuristic winning leaf at an already-repeated position in this sample.

A separate exhaustive legality/metadata audit passed all 26 documents: fast had 1,421 nodes/1,408 edges, 1,724 mate-defense mappings/2,742 mate responses, 205 null-pass threats, 23 checkmates and 58 unavoidable-mate endpoints. Balanced had 1,222 nodes/1,209 edges, 1,714 mappings/2,889 mate responses, 232 null-pass threats, 43 checkmates and 59 unavoidable-mate endpoints. These checks validate exact claims and legal structure, not every engine-based endpoint.

## Shared quality regression and targeted repair

Both version-4 configurations labeled #2 solved while retaining only `1.Qxf4 Be7`, omitting the critical acceptance `1...Bxf4`. The independent deeper reference is `Qxf4 Bxf4 Rxh5 gxh5 Rxh5 Bh6 Rxh6 Qg3+ Kxg3 Re1 Rh8#`. Accepting the offered queen is a distinct tactical resource; this omission is substantive, not simply a different equal principal variation. The balanced profile did not repair it despite costing about 50% more batch time.

This finding prompted a bounded generator-version-5 rule: nontrivial legal captures of the solver's last-moved piece are mandatory defensive candidates, like checks and defenses to an existing immediate mating threat. Replies that can be answered by exact mate in one remain separately recorded and pruned. The rule protects sacrifice-acceptance branches from shallow centipawn/mate score discontinuities.

## Final fast version-5 rerun

The corrected fast profile completed all thirteen positions in **20.65 seconds wall time**, with mean per-position elapsed time **10.49 seconds**, maximum **20.52 seconds**, and **7 solved / 6 needs review**. Evidence is in `benchmark-speed-fast-v5.jsonl` and `benchmark-speed-v5-summary.json`. Its known root keys all remain present, #1087 still excludes the false `Be3` alternative, and no heuristic winning leaf repeats an already visited position.

Puzzle #2 is now solved in 3.18 seconds with 32 nodes and contains the complete reference sacrifice sequence `Qxf4 Bxf4 Rxh5 gxh5 Rxh5 Bh6 Rxh6 Qg3+ Kxg3`, ending at an exact unavoidable-mate position. Alternate queen checks are also included. The rerun preserves #17's five anti-mate defenses and #2255's two actual checkmates. It additionally retains both `Bxe7`/`Kxe7` in #12 and both `Rxg7`/`Kxg7` in #1501.

The separate final audit passed all thirteen version-5 documents with zero issues: **1,409 nodes / 1,396 legal edges**, all **71 mandatory capture resources**, **1,970 mate-defense mappings / 3,225 mating responses**, **344 null-pass threats**, **12 checkmates**, and **69 unavoidable-mate terminals**. This is a structural and exact-tactics audit; heuristic endpoints were compared against the prior reference evidence rather than subjected to a new full set of deep searches.

## Recommendation and limits

Use the **fast version-5 profile** for the remaining bulk generation. The known critical resources now pass while the measured batch time stays essentially unchanged from the original fast profile. The user explicitly accepted shorter searches; these results support a measured speed tradeoff, not a claim of equal accuracy or a measured chess rating.

The thirteen-position sample is deliberately chosen and small. Shorter searches may change defensive ordering, stopping positions, or the number of review-required cases; passing the known cases does not prove that all critical resources in all 3,001 positions are found. Time/depth/node limits and `needs_review` must remain visible. Existing manual solutions must remain protected. The broader pilot and earlier production spot-check remain recorded separately in `pilot-review.md` and `production-spotcheck.md`.
