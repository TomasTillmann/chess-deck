# Production solution-tree chess spot-check

Twelve generated trees outside the ten-position pilot were inspected. All twelve contain the best first move from a fresh reference search. All 23 sampled heuristic endpoints remain strongly winning or mating in independent searches. The review found one concrete missing quiet-defense case, puzzle #17; its corrected generator-version-4 tree passes the targeted followup below. No further confirmed defect was found in this bounded sample.

## Scope and method

The sample is #6, #11, #12, #16, #17, #18, #21, #28, #34, #42, #46, and #56. These were available solved documents from the production run, selected before and after the run was paused for the #17 correction. This is an early-book convenience sample; the ten-position pilot separately spans the book. It is not a random estimate of quality across all 3,001 puzzles.

Reference searches used Stockfish 19, one thread, MultiPV 3, five seconds at each root, and two seconds at one or two distinct heuristic endpoints per tree. Endpoints favored long lines and low current solver material to challenge early stopping. Each root best move was compared to the accepted root moves. Every expanded opponent node was checked for omitted legal checking moves. Selected principal-variation disagreements were analyzed directly from the child position. Raw evidence, including FENs, SAN/UCI lines, depths, node counts, and scores, is in `production-spotcheck.json`; the corrected #17 endpoint is in `production-spotcheck-correction-17.json`.

Scores below are from the solver's perspective, in Stockfish pawn units. They do not describe literal material. `M7` means the reference found mate in seven. The table describes the sampled version-3 documents, before version-4 repairs; the #17 correction is recorded separately rather than silently replacing the evidence that exposed it.

| Puzzle | Accepted first move(s) | Fresh best score | Root depth | Sampled endpoint best scores |
| --- | --- | ---: | ---: | --- |
| 6 | Qh6 | M7 | 21 | M2, M5 |
| 11 | Bxb5, Bc4 | +6.59 | 19 | +8.01, +8.60 |
| 12 | Rxe7+ | +7.88 | 20 | +10.62, +9.10 |
| 16 | Qxc7+ | M13 | 19 | M7, M2 |
| 17 | Qxf3 | +13.28 | 19 | M7 |
| 18 | Rxe7 | +8.81 | 21 | +10.30, M2 |
| 21 | Rxd2 | +6.88 | 20 | +6.49, +6.96 |
| 28 | Bxg3 | +6.13 | 20 | +9.36, +9.04 |
| 34 | Rxf3 | +6.85 | 23 | +9.54, +7.66 |
| 42 | Rgxg5 | +7.10 | 27 | +6.78, +13.24 |
| 46 | Bxe6 | +5.48 | 19 | +5.71, +4.93 |
| 56 | Rxe8 | +15.60 | 26 | +15.87, +13.83 |

All twelve fresh best moves were accepted. No legal opponent check was missing from an expanded opponent node. The lowest finite endpoint best score was +4.93 (#46); this supports the specific sampled winning claims, not every possible stopping decision. Repeated SAN moves in #16 were replayed with full history: the apparent repeated knight maneuver included an intervening capture and did not repeat the position.

## Confirmed defect and correction: #17

Root FEN:

```text
2kr3r/pb1n1p2/2q1pP2/1pb5/2p2B2/2N2B2/PPQ2PPP/R4RK1 b - - 0 1
```

After `1...Qxf3`, White has a genuine `...Qxg2#` threat to answer. The old tree retained only `2.Ne4`. An independent root reference suggested `2.Qe4`; direct child analysis confirmed that this was not just an unstable root PV:

| Fresh child search | Best resistance | Other strong resistance | Difference |
| --- | --- | --- | ---: |
| 5 seconds, depth 15 | Ne4: Black +13.61 | Qe4: Black +13.77 | 16 cp |
| 10 seconds, depth 20 | Ne4: Black +14.92 | Qe4: Black +15.22 | 30 cp |

Both searches put `Qe4` comfortably inside the configured 100 cp defensive margin. It requires its own answer, such as `...Bxe4`. Exact legal-move enumeration is even stronger evidence: of 47 legal White replies, 42 allow an immediate mate and exactly five prevent it: **Qe4, Ne4, Qg6, gxf3, and Nd5**. Four of those five had been omitted, including accepting the queen sacrifice with `gxf3`.

The corrected rule retains all defenses that prevent mate in one when an immediate mating threat exists even if the opponent hypothetically passes. This null-pass condition matters: a move that blunders into a new mate does not establish a pre-existing mating threat. In #6, #18, and #34, some replies allowed immediate mate but there was no mate after a null pass; expanding every non-mating legal reply there would add many unrelated branches.

The final targeted document is `pilot-v4-resource-fix-17.json`, generator version 4: **solved, 26 nodes, 41.7 seconds, no review reasons**. After `...Qxf3`, it explicitly retains all five relevant defenses and records the other 42 replies with exact mate responses. It includes `Qe4 Bxe4`, the distinct response missing from the old tree. A separate exact audit found no issues in its 26 nodes/25 edges, verified 172 defensive mate mappings and 180 mating responses, both unavoidable-mate terminals, and five null-pass threat annotations.

The `Qe4 Bxe4` branch stops at a material-resolved endpoint. An additional fresh two-second search, depth 23, found White's best resistance `Nxe4` still leaves Black +16.21; `gxf3` allows mate in four. This endpoint therefore survives the independent winning-position check. It remains an instructional stopping heuristic, not a claim that every remaining legal move has been expanded.

## Principal-variation differences that were not confirmed defects

**#11:** The root reference preferred `Bc4`, which the tree accepts alongside `Bxb5`. After `Bc4 Qc7`, its PV continued `Bd5` while the tree used `Bxf7+`. A fresh five-second child search preferred the stored `Bxf7+` at +7.97, ahead of `Bd5` +6.79 and `Be6` +5.70. Both attacking choices are sound; the difference is not evidence of an omitted defensive resource.

**#12:** The root PV continued `Rxe7+ Bxe7 Qd5 Rd8`, and `...Rd8` was absent from the stored branch. A fresh five-second child search, depth 22, found `...Ra7` +9.45 and `...Rc8` +9.88 to be stronger defenses than `...Rd8` +12.46 or `...Qd7` +12.19 (scores for White). The stored stronger defenses were present. This particular omission was therefore not confirmed as a quality failure. Checking the actual child position prevents treating every shallow PV change as a missing critical line.

## Limits and outcome

This review supports the corrected #17 behavior and the specific sampled roots and endpoints. It does not prove completeness of the quiet-defense search, that every winning endpoint is pedagogically ideal, or that all 3,001 solutions are correct. Short searches, finite candidate caps, evaluation margins, and search contention can still miss resources. Positions with exhausted budgets or ambiguous objectives must retain `needs_review`, and manual solution editing remains important.

The distinction between a modern Stockfish evaluation and material is described in the [official WDL model](https://github.com/official-stockfish/WDL_model). The [official MultiPV measurements](https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html#elo-cost-of-using-multipv) also explain why searching more candidate moves trades depth for breadth at a fixed time budget. Exact legal mate tests and explicit review status complement engine scores; they do not turn bounded engine analysis into a complete proof.
