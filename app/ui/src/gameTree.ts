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

export type MoveReview = "solution-missing" | "user-extra";

export type MoveTreeNode = {
  id: string;
  fen: string;
  lastMove?: Key[];
  move?: MoveRecord;
  review?: MoveReview;
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

export function existingPath(root: MoveTreeNode, path: MovePath): MovePath {
  const result: MovePath = [];
  let node = root;

  for (const id of path) {
    const child = node.children.find(candidate => candidate.id === id);
    if (!child) return result;
    result.push(id);
    node = child;
  }

  return result;
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

export function isPathDescendantOf(path: MovePath, ancestorPath: MovePath): boolean {
  return path.length > ancestorPath.length && ancestorPath.every((part, index) => part === path[index]);
}

export function siblingIndexAtPath(root: MoveTreeNode, path: MovePath): number {
  if (path.length === 0) return -1;

  const parent = nodeAtPath(root, path.slice(0, -1));
  return parent.children.findIndex(child => child.id === path[path.length - 1]);
}

export function resetNodeChildren(root: MoveTreeNode, path: MovePath): MoveTreeNode {
  return updateNodeAtPath(root, path, node => ({
    ...node,
    children: [],
  }));
}

export function moveNodeAmongSiblings(root: MoveTreeNode, path: MovePath, direction: -1 | 1): MoveTreeNode {
  if (path.length === 0) return root;

  const parentPath = path.slice(0, -1);
  const childId = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, parent => {
    const fromIndex = parent.children.findIndex(child => child.id === childId);
    const toIndex = fromIndex + direction;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= parent.children.length) return parent;

    const children = [...parent.children];
    const [child] = children.splice(fromIndex, 1);
    children.splice(toIndex, 0, child);

    return {
      ...parent,
      children,
    };
  });
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
