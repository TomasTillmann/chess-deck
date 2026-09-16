"""Replay stored trees without engine evaluations. Run from any directory with solver/.venv/bin/python.

Use --watch 30 to audit new/changed documents until every deck FEN is stored.
Manual/legacy trees retain their older optional metadata; engine-v3 trees are strict.
"""

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import time

import chess


ROOT = Path(__file__).resolve().parents[2]
AUDIT_REVISION = 4
REVIEW_TERMINALS = {"max_depth", "max_nodes", "max_seconds", "analysis_unavailable", "repetition_unresolved"}
TERMINALS = REVIEW_TERMINALS | {"checkmate", "draw", "unavoidable_mate", "material_resolved", "advantage_resolved", "equality_resolved"}


def mate_threats(position):
    if position.is_check():
        return []
    passed = position.copy(stack=True)
    passed.push(chess.Move.null())
    threats = []
    for move in list(passed.legal_moves):
        passed.push(move)
        if passed.is_checkmate():
            threats.append(move.uci())
        passed.pop()
    return threats


def sacrifice_acceptances(position):
    if not position.move_stack:
        return []
    target = position.peek().to_square
    captures = []
    for move in position.legal_moves:
        captured = move.to_square
        if position.is_en_passant(move):
            captured += -8 if position.turn == chess.WHITE else 8
        if position.is_capture(move) and captured == target:
            captures.append(move.uci())
    return captures


def audit_tree(fen, document):
    errors, reasons, defense_gaps, sacrifice_gaps = [], set(), [], []
    counts, terminals = Counter(), Counter()
    source = document.get("source", "legacy")
    generator = document.get("generator", {})
    strict = source == "engine" and generator.get("version", 0) >= 3
    board = chess.Board(fen)
    side = board.turn

    def fail(path, message):
        errors.append({"path": " ".join(path) or "root", "error": message})

    def visit(node, position, path):
        counts["nodes"] += 1
        if not isinstance(node, dict):
            fail(path, "Position node is not an object")
            return
        try:
            actual = chess.Board(node.get("fen", ""))
            if actual.fen() != position.fen():
                fail(path, f"FEN mismatch: expected {position.fen()}, got {actual.fen()}")
        except (TypeError, ValueError) as exc:
            fail(path, f"Invalid node FEN: {exc}")
        expected_turn = "w" if position.turn else "b"
        if node.get("turn") != expected_turn:
            fail(path, f"Turn must be {expected_turn}")
        expected_choice = "any" if position.turn == side else "all"
        if (strict or "choice" in node) and node.get("choice") != expected_choice:
            fail(path, f"Choice must be {expected_choice}")
        node_reasons = node.get("reviewReasons", [])
        if not isinstance(node_reasons, list) or not all(isinstance(reason, str) for reason in node_reasons):
            fail(path, "reviewReasons must be an array of strings")
            node_reasons = []
        reasons.update(node_reasons)
        terminal = node.get("terminal")
        moves = node.get("moves", [])
        if not isinstance(moves, list):
            fail(path, "Moves must be an array")
            return
        if terminal is not None:
            terminals[str(terminal)] += 1
            if strict and terminal not in TERMINALS:
                fail(path, f"Unknown engine-v3 terminal {terminal!r}")
            if moves:
                fail(path, "Terminal node has outgoing moves")
        if strict and terminal is None and not moves:
            fail(path, "Nonterminal engine node has no moves")
        if strict and terminal in REVIEW_TERMINALS and terminal not in node_reasons:
            fail(path, "Truncated/unavailable node is missing its review reason")
        if terminal == "checkmate" and not position.is_checkmate():
            fail(path, "Claimed checkmate is not checkmate")
        if strict and position.is_checkmate() and terminal != "checkmate":
            fail(path, "Checkmate position is not marked checkmate")
        if terminal == "draw":
            outcome = position.outcome(claim_draw=True)
            if outcome is None or outcome.winner is not None:
                fail(path, "Claimed draw is unavailable with full line history")
            else:
                counts[f"draw_{outcome.termination.name.lower()}"] += 1

        certificates = node.get("immediateMateReplies", {})
        if not isinstance(certificates, dict):
            fail(path, "immediateMateReplies must be an object")
            certificates = {}
        if certificates and position.turn == side:
            fail(path, "Mate reply certificates must occur on the opponent turn")
        for uci, mates in certificates.items():
            counts["certified_defenses"] += 1
            try:
                reply = position.parse_uci(uci)
                if reply not in position.legal_moves:
                    raise ValueError("Move is not legal")
                after_reply = position.copy(stack=True)
                after_reply.push(reply)
            except (TypeError, ValueError) as exc:
                fail(path + [str(uci)], f"Illegal certified defense: {exc}")
                continue
            if after_reply.outcome(claim_draw=True) is not None:
                fail(path + [uci], "Certified defense already ends or can draw the game")
            if not isinstance(mates, list) or not mates:
                fail(path + [uci], "Certified defense has no mating response")
                continue
            if len(mates) != len(set(mates)):
                fail(path + [uci], "Duplicate certified mating responses")
            for mating_uci in mates:
                counts["certified_mates"] += 1
                try:
                    mating = after_reply.parse_uci(mating_uci)
                    if mating not in after_reply.legal_moves:
                        raise ValueError("Move is not legal")
                    final = after_reply.copy(stack=True)
                    final.push(mating)
                    if not final.is_checkmate() or final.turn == side:
                        fail(path + [uci, mating_uci], "Certified response does not checkmate the opponent")
                except (TypeError, ValueError) as exc:
                    fail(path + [uci, str(mating_uci)], f"Illegal certified mate: {exc}")
        if terminal == "unavoidable_mate":
            if position.turn == side or not certificates or set(certificates) != {move.uci() for move in position.legal_moves}:
                fail(path, "Unavoidable mate must certify every legal opponent reply")

        seen = set()
        for edge in moves:
            counts["edges"] += 1
            if not isinstance(edge, dict):
                fail(path, "Move edge is not an object")
                continue
            uci = edge.get("uci")
            if not isinstance(uci, str):
                fail(path, "Move UCI is not a string")
                continue
            if uci in seen:
                fail(path + [uci], "Duplicate move edge")
            seen.add(uci)
            if uci in certificates:
                fail(path + [uci], "Explicit edge duplicates a certified immediate-mate defense")
            try:
                move = position.parse_uci(uci)
                if move not in position.legal_moves:
                    raise ValueError("Move is not legal")
                child_board = position.copy(stack=True)
                child_board.push(move)
            except ValueError as exc:
                fail(path + [uci], f"Illegal UCI move: {exc}")
                continue
            children = edge.get("children", [])
            if not isinstance(children, list) or (strict and len(children) != 1):
                fail(path + [uci], "Engine move must have exactly one position child")
                continue
            for child in children:
                visit(child, child_board, path + [uci])
        threats = mate_threats(position) if position.turn != side and moves and certificates else []
        if threats:
            missing = sorted({move.uci() for move in position.legal_moves} - seen - set(certificates))
            if missing:
                defense_gaps.append({"path": path, "fen": position.fen(), "mateThreatsAfterPass": threats, "missingMoves": missing})
                if source == "engine" and generator.get("version", 0) >= 4:
                    fail(path, f"Mate-preventing legal defenses omitted: {', '.join(missing)}")
        if position.turn != side and moves:
            missing = sorted(set(sacrifice_acceptances(position)) - seen - set(certificates))
            if missing:
                sacrifice_gaps.append({"path": path, "fen": position.fen(), "lastMove": position.peek().uci(), "missingMoves": missing})
                if source == "engine" and generator.get("version", 0) >= 5:
                    fail(path, f"Legal captures of the solver's last-moved piece omitted: {', '.join(missing)}")

    if document.get("fen") != fen:
        fail([], "Document FEN does not equal its database key")
    if not board.is_valid():
        fail([], "Deck FEN is not a valid chess position")
    if document.get("sideToSolve") != ("w" if side else "b"):
        fail([], "sideToSolve does not match the original side to move")
    root = document.get("root")
    if not isinstance(root, dict) or not root.get("moves"):
        fail([], "Solution root has no moves")
    visit(root, board, [])
    quality = document.get("quality", {})
    if strict:
        declared = quality.get("reviewReasons")
        if not isinstance(declared, list) or not all(isinstance(reason, str) for reason in declared):
            fail([], "Quality reviewReasons must be an array of strings")
        elif set(declared) != reasons:
            fail([], "Quality reviewReasons differs from the union of node reasons")
        if document.get("status") != ("needs_review" if reasons else "solved"):
            fail([], "Status is inconsistent with review reasons")
        if quality.get("nodes") != counts["nodes"]:
            fail([], "quality.nodes does not match replayed position count")
    return {"source": source, "generatorVersion": generator.get("version"),
            "generatedAt": generator.get("generatedAt"), "strict": strict,
            "status": document.get("status"), "reviewReasons": sorted(reasons),
            "counts": dict(counts), "terminals": dict(terminals), "errors": errors,
            "mateDefenseCoverageGaps": defense_gaps, "sacrificeDefenseCoverageGaps": sacrifice_gaps}


def audit_database(database, deck, output, cache, collection="encyclopedia", container=None):
    fens = [line.strip() for line in deck.read_text().splitlines() if line.strip()]
    positions = {}
    for index, fen in enumerate(fens, 1):
        positions.setdefault(fen, []).append(index)
    database_source = str(database.resolve())
    if container:
        # Docker bind-mounted WAL files can appear stale to host SQLite readers.
        script = ('import Database from "better-sqlite3";'
                  'const db = new Database(process.env.DATABASE_URL, {readonly: true});'
                  'try { process.stdout.write(JSON.stringify({database: process.env.DATABASE_URL,'
                  'rows: db.prepare("SELECT fen, tree FROM solutions WHERE collection = ?").all(process.argv[1])})); }'
                  'finally { db.close(); }')
        snapshot = json.loads(subprocess.check_output(["docker", "exec", container, "node", "--input-type=module", "-e", script, collection]))
        rows = [(row["fen"], row["tree"]) for row in snapshot["rows"]]
        database_source = f"{container}:{snapshot['database']}"
    else:
        with sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True) as connection:
            rows = connection.execute("SELECT fen, tree FROM solutions WHERE collection = ?", (collection,)).fetchall()
    current, changed = {}, []
    for fen, raw in rows:
        if fen not in positions:
            continue
        digest = hashlib.sha256(raw.encode()).hexdigest()
        result = cache.get(fen)
        if not result or result.get("digest") != digest or result.get("auditRevision") != AUDIT_REVISION:
            try:
                result = audit_tree(fen, json.loads(raw))
            except Exception as exc:
                result = {"errors": [{"path": "document", "error": f"Audit failed: {type(exc).__name__}: {exc}"}]}
            result.update(digest=digest, fen=fen, positions=positions[fen], auditRevision=AUDIT_REVISION)
            changed.append(result)
        current[fen] = result
    counters = {key: Counter() for key in ("status", "source", "reviewReasons", "counts", "terminals")}
    errors = []
    for result in current.values():
        for key in ("status", "source"):
            counters[key][str(result.get(key))] += 1
        counters["reviewReasons"].update(result.get("reviewReasons", []))
        for key in ("counts", "terminals"):
            counters[key].update(result.get(key, {}))
        errors.extend({"positions": result["positions"], "fen": result["fen"], **error} for error in result["errors"])
    missing = [{"positions": ids, "fen": fen} for fen, ids in positions.items() if fen not in current]
    report = {"auditedAt": datetime.now(timezone.utc).isoformat(), "database": database_source, "collection": collection,
              "deck": str(deck.resolve()), "deckPositions": len(fens), "uniqueFens": len(positions),
              "duplicatePositions": len(fens) - len(positions), "storedFens": len(current),
              "coveredPositions": sum(len(positions[fen]) for fen in current),
              "complete": not missing, "strictEngineDocuments": sum(bool(value.get("strict")) for value in current.values()),
              "mateDefenseCoverageGapDocuments": sum(bool(value.get("mateDefenseCoverageGaps")) for value in current.values()),
              "sacrificeDefenseCoverageGapDocuments": sum(bool(value.get("sacrificeDefenseCoverageGaps")) for value in current.values()),
              **{key: dict(value) for key, value in counters.items()}, "missing": missing,
              "errors": errors, "documents": list(current.values()),
              "scope": "Legal replay, canonical FENs, tree structure, metadata consistency and exact mate/draw certificates; no engine-evaluation or tactical-completeness claims."}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n")
    temporary.replace(output)
    engine_sacrifice_gaps = sum(value.get("source") == "engine" and bool(value.get("sacrificeDefenseCoverageGaps")) for value in current.values())
    preserved_sacrifice_gaps = report["sacrificeDefenseCoverageGapDocuments"] - engine_sacrifice_gaps
    markdown = ["# Encyclopedia solution integrity audit", "", report["scope"], "",
                f"Audited: {report['auditedAt']}", "",
                f"Coverage: **{len(current)} / {len(positions)} unique FENs**, **{report['coveredPositions']} / {len(fens)} puzzle positions** ({report['duplicatePositions']} repeated positions).",
                f"Tree nodes: **{counters['counts']['nodes']:,}**; explicit moves: **{counters['counts']['edges']:,}**; verified mating certificates: **{counters['counts']['certified_mates']:,}**.",
                f"Integrity errors: **{len(errors)}**. Missing unique FENs: **{len(missing)}**.", "",
                f"Documents with omitted mate-preventing defenses: **{report['mateDefenseCoverageGapDocuments']}** (an integrity error for engine v4+).", "",
                f"Sacrifice-acceptance gaps: **{engine_sacrifice_gaps} engine-generated documents**, **{preserved_sacrifice_gaps} preserved manual/legacy documents**. Preserved user solutions are exempt from generator coverage requirements.", "",
                "| Category | Counts |", "| --- | --- |"]
    for key in ("status", "source", "reviewReasons", "terminals"):
        markdown.append(f"| {key} | " + "; ".join(f"{name}: {count}" for name, count in sorted(counters[key].items())) + " |")
    markdown += ["", "Engine-v3 documents require all current invariants. Manual and legacy documents are replayed with compatible optional metadata.",
                 "The JSON report contains per-document results, missing FENs, and exact error paths."]
    if errors:
        markdown += ["", "## Errors", ""]
        markdown += [f"- Puzzle(s) {error['positions']}, `{error['path']}`: {error['error']}" for error in errors]
    output.with_suffix(".md").write_text("\n".join(markdown) + "\n")
    for result in changed:
        if result["errors"]:
            print(json.dumps({"event": "audit_errors", "positions": result["positions"], "errors": result["errors"]}), flush=True)
    return report, current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "app/server/data/woodpecker.sqlite")
    parser.add_argument("--collection", default="encyclopedia")
    parser.add_argument("--container", help="Read inside this server container to avoid stale host views of Docker WAL files")
    parser.add_argument("--deck", type=Path, default=ROOT / "fen/encyclopedia/encyclopedia.fen")
    parser.add_argument("--output", type=Path, default=ROOT / "solver/reports/encyclopedia-audit.json")
    parser.add_argument("--watch", type=float, default=0, help="Seconds between snapshots; stop when coverage is complete")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return 0
    cache = {}
    if args.output.exists():
        cache = {item["fen"]: item for item in json.loads(args.output.read_text()).get("documents", [])}
    last_progress = -100
    while True:
        report, cache = audit_database(args.database, args.deck, args.output, cache, args.collection, args.container)
        if report["storedFens"] - last_progress >= 100 or report["complete"] or not args.watch:
            print(json.dumps({key: report[key] for key in ("auditedAt", "storedFens", "uniqueFens", "complete", "status")}
                             | {"errorCount": len(report["errors"])}), flush=True)
            last_progress = report["storedFens"]
        if not args.watch or report["complete"]:
            return 1 if report["errors"] else 0
        time.sleep(max(1, args.watch))


def self_check():
    def document(fen, moves, terminal):
        board = chess.Board(fen)
        root, node = {}, None
        for depth in range(len(moves) + 1):
            current = {"fen": board.fen(), "turn": "w" if board.turn else "b",
                       "choice": "any" if depth % 2 == 0 else "all", "terminal": None, "moves": []}
            if node is None:
                root = current
            else:
                node["moves"] = [{"uci": moves[depth - 1], "children": [current]}]
            node = current
            if depth < len(moves):
                board.push_uci(moves[depth])
        node["terminal"] = terminal
        return {"fen": fen, "sideToSolve": "w" if chess.Board(fen).turn else "b", "source": "engine", "status": "solved",
                "generator": {"version": 3}, "quality": {"nodes": len(moves) + 1, "reviewReasons": []}, "root": root}

    fen = "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1"
    mate = document(fen, ["g1g2", "h8h7", "g2g7"], "checkmate")
    assert not audit_tree(fen, mate)["errors"]
    certified = document(fen, ["g1g2"], "unavoidable_mate")
    child = certified["root"]["moves"][0]["children"][0]
    child["immediateMateReplies"] = {"h8h7": ["g2g7"]}
    assert not audit_tree(fen, certified)["errors"]
    broken = deepcopy(certified)
    broken["root"]["moves"][0]["children"][0]["immediateMateReplies"] = {"h8h7": ["g2g3"]}
    assert audit_tree(fen, broken)["errors"]
    broken = deepcopy(mate)
    broken["root"]["moves"][0]["children"][0]["fen"] = fen
    assert audit_tree(fen, broken)["errors"]
    broken["root"]["moves"][0]["uci"] = "0000"
    assert any("Illegal UCI" in error["error"] for error in audit_tree(fen, broken)["errors"])
    draw = document(chess.STARTING_FEN, ["g1f3", "g8f6", "f3g1", "f6g8"] * 2, "draw")
    assert not audit_tree(chess.STARTING_FEN, draw)["errors"]
    threat_fen = "2kr3r/pb1n1p2/2q1pP2/1pb5/2p2B2/2N2B2/PPQ2PPP/R4RK1 b - - 0 1"
    missing = document(threat_fen, ["c6f3", "c3e4"], "advantage_resolved")
    missing["generator"]["version"] = 4
    child = missing["root"]["moves"][0]["children"][0]
    position = chess.Board(child["fen"])
    certificates = {}
    for defense in list(position.legal_moves):
        position.push(defense)
        mates = []
        for move in list(position.legal_moves):
            position.push(move)
            if position.is_checkmate():
                mates.append(move.uci())
            position.pop()
        position.pop()
        if mates:
            certificates[defense.uci()] = mates
    child["immediateMateReplies"] = certificates
    assert audit_tree(threat_fen, missing)["mateDefenseCoverageGaps"][0]["missingMoves"] == ["c2e4", "c2g6", "c3d5", "g2f3"]
    assert any("defenses omitted" in error["error"] for error in audit_tree(threat_fen, missing)["errors"])
    sacrifice_fen = "4r1k1/p1qr1p2/2pb1Bp1/1p5p/3P1n1R/3B1P2/PP3PK1/2Q4R w - - 0 1"
    sacrifice = document(sacrifice_fen, ["c1f4", "d6e5"], "advantage_resolved")
    sacrifice["generator"]["version"] = 5
    assert audit_tree(sacrifice_fen, sacrifice)["sacrificeDefenseCoverageGaps"][0]["missingMoves"] == ["d6f4"]
    assert any("last-moved piece omitted" in error["error"] for error in audit_tree(sacrifice_fen, sacrifice)["errors"])
    ep = chess.Board("7k/8/8/8/3p4/8/4P3/K7 w - - 0 1")
    ep.push_uci("e2e4")
    assert sacrifice_acceptances(ep) == ["d4e3"]
    print("Audit self-check passed: legal replay, FEN mismatch, exact mates, full-history draw, missing mate-threat defenses, sacrifice acceptance and en passant.")


if __name__ == "__main__":
    raise SystemExit(main())
