import type { Color } from "chessops";
import type { Key } from "@lichess-org/chessground/types";

export type MovePath = string[];

export type MoveRecord = {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  moveNumber: number;
};

export type MoveTreeNode = {
  id: string;
  fen: string;
  lastMove?: Key[];
  move?: MoveRecord;
  children: MoveTreeNode[];
};

export function createMoveRoot(fen: string): MoveTreeNode {
  return {
    id: "root",
    fen,
    children: [],
  };
}

export function pathsEqual(left: MovePath, right: MovePath): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

export function childPath(path: MovePath, child: MoveTreeNode): MovePath {
  return [...path, child.id];
}

export function nodeAtPath(root: MoveTreeNode, path: MovePath): MoveTreeNode {
  let node = root;

  for (const id of path) {
    const child = node.children.find(candidate => candidate.id === id);
    if (!child) return node;
    node = child;
  }

  return node;
}

export function updateNodeAtPath(
  root: MoveTreeNode,
  path: MovePath,
  update: (node: MoveTreeNode) => MoveTreeNode,
): MoveTreeNode {
  if (path.length === 0) return update(root);

  const [nextId, ...rest] = path;

  return {
    ...root,
    children: root.children.map(child => (child.id === nextId ? updateNodeAtPath(child, rest, update) : child)),
  };
}

export function firstChildPath(root: MoveTreeNode, path: MovePath): MovePath | undefined {
  const child = nodeAtPath(root, path).children[0];
  return child ? [...path, child.id] : undefined;
}

export function lastMainlinePath(root: MoveTreeNode, path: MovePath): MovePath {
  const lastPath = [...path];
  let node = nodeAtPath(root, path);

  while (node.children[0]) {
    node = node.children[0];
    lastPath.push(node.id);
  }

  return lastPath;
}
