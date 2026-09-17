import { fen as chessFen } from "chessops";

import type { MoveTreeNode } from "./gameTree";

export type SolutionDocument = {
  readonly fen?: unknown;
  readonly sideToSolve?: unknown;
  readonly status?: unknown;
  readonly source?: unknown;
  readonly quality?: unknown;
  readonly root?: unknown;
};

type StoredSolutionPosition = {
  readonly fen: string;
  readonly turn: "w" | "b";
  readonly terminal: null;
  readonly choice: "any" | "all";
  readonly moves: StoredSolutionMove[];
};

type StoredSolutionMove = {
  readonly uci: string;
  readonly children: StoredSolutionPosition[];
};

export class SolutionFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SolutionFetchError";
  }
}

export class SolutionUpdateError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SolutionUpdateError";
  }
}

const serverBaseUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001";
// ponytail: ordering within this tab; server revisions are needed across clients.
const pendingUpdates = new Map<string, Promise<void>>();

function turnFromFen(fen: string): "w" | "b" {
  return chessFen.parseFen(fen).unwrap().turn === "white" ? "w" : "b";
}

function solutionPositionNode(node: MoveTreeNode, solverTurn: "w" | "b"): StoredSolutionPosition {
  return {
    fen: node.fen,
    turn: turnFromFen(node.fen),
    terminal: null,
    choice: turnFromFen(node.fen) === solverTurn ? "any" : "all",
    moves: node.children.flatMap(child =>
      child.move
        ? [
            {
              uci: child.move.uci,
              children: [solutionPositionNode(child, solverTurn)],
            },
          ]
        : [],
    ),
  };
}

export function solutionDocumentFromMoveTree(initialFen: string, root: MoveTreeNode): SolutionDocument {
  return {
    fen: initialFen,
    sideToSolve: turnFromFen(initialFen),
    status: "solved",
    source: "manual",
    root: solutionPositionNode(root, turnFromFen(initialFen)),
  };
}

export async function fetchSolution(collection: string, initialFen: string): Promise<SolutionDocument> {
  const url = new URL(`/v1/solution/${encodeURIComponent(initialFen)}`, serverBaseUrl);
  url.searchParams.set("collection", collection);
  const response = await fetch(url.href);

  if (!response.ok) {
    throw new SolutionFetchError(response.status === 404 ? "Solution not found" : "Solution request failed", response.status);
  }

  return (await response.json()) as SolutionDocument;
}

export async function updateSolution(
  collection: string,
  initialFen: string,
  root: MoveTreeNode,
): Promise<void> {
  const body = JSON.stringify({
    collection,
    solutions: [
      {
        fen: initialFen,
        tree: solutionDocumentFromMoveTree(initialFen, root),
      },
    ],
  });
  const key = JSON.stringify([collection, initialFen]);
  const previous = pendingUpdates.get(key) ?? Promise.resolve();
  const request = previous.catch(() => {}).then(async () => {
    const response = await fetch(new URL("/v1/solver/solutions", serverBaseUrl).href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    if (!response.ok) {
      throw new SolutionUpdateError("Solution update failed", response.status);
    }
  });
  pendingUpdates.set(key, request);

  try {
    await request;
  } finally {
    if (pendingUpdates.get(key) === request) pendingUpdates.delete(key);
  }
}
