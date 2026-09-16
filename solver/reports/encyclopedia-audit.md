# Encyclopedia solution integrity audit

Legal replay, canonical FENs, tree structure, metadata consistency and exact mate/draw certificates; no engine-evaluation or tactical-completeness claims.

Audited: 2026-09-16T20:21:12.407023+00:00

Coverage: **1346 / 2993 unique FENs**, **1352 / 3001 puzzle positions** (8 repeated positions).
Tree nodes: **159,691**; explicit moves: **158,345**; verified mating certificates: **171,982**.
Integrity errors: **0**. Missing unique FENs: **1647**.

Documents with omitted mate-preventing defenses: **0** (an integrity error for engine v4+).

Sacrifice-acceptance gaps: **0 engine-generated documents**, **1 preserved manual/legacy documents**. Preserved user solutions are exempt from generator coverage requirements.

| Category | Counts |
| --- | --- |
| status | needs_review: 995; solved: 351 |
| source | engine: 1343; legacy: 1; manual: 2 |
| reviewReasons | ambiguous_root: 76; candidate_limit: 478; losing_root: 6; max_depth: 382; max_nodes: 208; max_seconds: 769; repetition_unresolved: 20 |
| terminals | advantage_resolved: 34505; checkmate: 974; draw: 411; equality_resolved: 1131; material_resolved: 5299; max_depth: 33522; max_nodes: 10189; max_seconds: 17309; repetition_unresolved: 32; unavoidable_mate: 1079 |

Engine-v3 documents require all current invariants. Manual and legacy documents are replayed with compatible optional metadata.
The JSON report contains per-document results, missing FENs, and exact error paths.
