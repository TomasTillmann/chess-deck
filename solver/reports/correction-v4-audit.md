# Encyclopedia solution integrity audit

Legal replay, canonical FENs, tree structure, metadata consistency and exact mate/draw certificates; no engine-evaluation or tactical-completeness claims.

Audited: 2026-09-16T19:45:05.418793+00:00

Coverage: **19 / 2993 unique FENs**, **19 / 3001 puzzle positions** (8 repeated positions).
Tree nodes: **1,326**; explicit moves: **1,307**; verified mating certificates: **4,774**.
Integrity errors: **0**. Missing unique FENs: **2974**.

Documents with omitted mate-preventing defenses: **0** (an integrity error for engine v4+).

| Category | Counts |
| --- | --- |
| status | needs_review: 9; solved: 10 |
| source | engine: 19 |
| reviewReasons | candidate_limit: 4; max_nodes: 1; max_seconds: 7 |
| terminals | advantage_resolved: 444; checkmate: 14; material_resolved: 108; max_nodes: 26; max_seconds: 104; unavoidable_mate: 56 |

Engine-v3 documents require all current invariants. Manual and legacy documents are replayed with compatible optional metadata.
The JSON report contains per-document results, missing FENs, and exact error paths.
