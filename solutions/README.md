# Saved solutions

`solutions.sqlite` is a Git LFS snapshot of all 4,119 active solutions:
1,126 Woodpecker and 2,993 Encyclopedia positions. It includes existing and newly
generated answers, preserving their original trees and `needs_review` labels.
It contains only the `solutions` table; practice history, learner IDs, saved
Deck Views, and experimental solutions are excluded.

The running app continues to use its ignored local database. This snapshot is
not loaded automatically.

## Download and import

Install [Git LFS](https://git-lfs.com/), then run from the repository root:

```bash
git lfs install
git lfs pull --include="solutions/solutions.sqlite"
```

Start the app once to initialize its database, then import with `sqlite3`:

```bash
sqlite3 app/server/data/woodpecker.sqlite <<'SQL'
.bail on
.timeout 10000
ATTACH DATABASE 'file:solutions/solutions.sqlite?mode=ro' AS saved;
BEGIN IMMEDIATE;
INSERT INTO main.solutions (fen, collection, tree)
SELECT fen, collection, tree FROM saved.solutions WHERE true
ON CONFLICT (collection, fen) DO NOTHING;
SELECT changes() AS imported_solutions;
COMMIT;
SQL
```

Importing again is safe: existing answers and all practice history are preserved.
The import does not create decks; their source positions are in `fen/`.

## Refresh the snapshot

After generating or editing solutions, run from the repository root:

```bash
sqlite3 solutions/solutions.sqlite <<'SQL'
.bail on
.timeout 10000
ATTACH DATABASE 'file:app/server/data/woodpecker.sqlite?mode=ro' AS live;
BEGIN IMMEDIATE;
DELETE FROM main.solutions;
INSERT INTO main.solutions (fen, collection, tree)
SELECT s.fen, s.collection, s.tree FROM live.solutions s
WHERE EXISTS (SELECT 1 FROM live.collections c
              WHERE c.collection = s.collection AND c.fen = s.fen)
ORDER BY s.collection, s.fen;
COMMIT;
VACUUM main;
PRAGMA main.integrity_check;
SQL
```

This reads the live database without changing it. Review the counts before
committing the updated snapshot. Keep the runtime database and its WAL files
ignored; only this separate snapshot belongs in LFS.
