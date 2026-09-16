# Encyclopedia solution integrity audit

Legal replay, canonical FENs, tree structure, metadata consistency and exact mate/draw certificates; no engine-evaluation or tactical-completeness claims.

Audited: 2026-09-16T19:52:09.899101+00:00

Coverage: **35 / 2993 unique FENs**, **35 / 3001 puzzle positions** (8 repeated positions).
Tree nodes: **3,255**; explicit moves: **3,220**; verified mating certificates: **3,744**.
Integrity errors: **0**. Missing unique FENs: **2958**.

Documents with omitted mate-preventing defenses: **0** (an integrity error for engine v4+).

Documents with omitted sacrifice acceptances: **0** (an integrity error for engine v5+).

| Category | Counts |
| --- | --- |
| status | needs_review: 26; solved: 9 |
| source | engine: 35 |
| reviewReasons | candidate_limit: 8; max_depth: 6; max_nodes: 2; max_seconds: 21; repetition_unresolved: 2 |
| terminals | advantage_resolved: 1111; checkmate: 28; material_resolved: 230; max_depth: 199; max_nodes: 38; max_seconds: 308; repetition_unresolved: 2; unavoidable_mate: 43 |

Engine-v3 documents require all current invariants. Manual and legacy documents are replayed with compatible optional metadata.
The JSON report contains per-document results, missing FENs, and exact error paths.
