import { useEffect, useMemo, useRef, type Ref } from "react";

import {
  childPath,
  firstChildPath,
  lastMainlinePath,
  pathsEqual,
  type MovePath,
  type MoveTreeNode,
} from "../gameTree";

type MoveNotationPanelProps = {
  root: MoveTreeNode;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
};

function movePrefix(node: MoveTreeNode, startsLine: boolean): string | undefined {
  if (!node.move) return undefined;
  if (node.move.color === "white") return `${node.move.moveNumber}.`;
  if (startsLine) return `${node.move.moveNumber}...`;

  return undefined;
}

function MoveButton({
  node,
  path,
  currentPath,
  onSelectPath,
  currentRef,
}: {
  node: MoveTreeNode;
  path: MovePath;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
  currentRef?: Ref<HTMLButtonElement>;
}) {
  if (!node.move) return null;

  const isCurrent = pathsEqual(path, currentPath);

  return (
    <button
      ref={isCurrent ? currentRef : undefined}
      type="button"
      className={isCurrent ? "notation-move is-current" : "notation-move"}
      onClick={() => onSelectPath(path)}
      aria-current={isCurrent ? "step" : undefined}
    >
      {node.move.san}
    </button>
  );
}

function MoveToken({
  node,
  path,
  currentPath,
  startsLine,
  onSelectPath,
  currentRef,
}: {
  node: MoveTreeNode;
  path: MovePath;
  currentPath: MovePath;
  startsLine: boolean;
  onSelectPath: (path: MovePath) => void;
  currentRef?: Ref<HTMLButtonElement>;
}) {
  const prefix = movePrefix(node, startsLine);

  return (
    <span className="notation-token">
      {prefix ? <span className="notation-index">{prefix}</span> : null}
      <MoveButton
        node={node}
        path={path}
        currentPath={currentPath}
        onSelectPath={onSelectPath}
        currentRef={currentRef}
      />
    </span>
  );
}

function MoveLine({
  firstNode,
  parentPath,
  currentPath,
  onSelectPath,
  currentRef,
  variant,
}: {
  firstNode: MoveTreeNode;
  parentPath: MovePath;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
  currentRef?: Ref<HTMLButtonElement>;
  variant: "mainline" | "variation";
}) {
  const items = [];
  let node: MoveTreeNode | undefined = firstNode;
  let path = parentPath;
  let startsLine = true;

  while (node) {
    const nodePath = childPath(path, node);
    const sideLines = node.children.slice(1);

    items.push(
      <MoveToken
        key={nodePath.join("/")}
        node={node}
        path={nodePath}
        currentPath={currentPath}
        startsLine={startsLine}
        onSelectPath={onSelectPath}
        currentRef={currentRef}
      />,
    );

    if (sideLines.length > 0) {
      items.push(
        <div className="notation-variations" key={`${nodePath.join("/")}-variations`}>
          {sideLines.map(child => (
            <MoveLine
              key={child.id}
              firstNode={child}
              parentPath={nodePath}
              currentPath={currentPath}
              onSelectPath={onSelectPath}
              currentRef={currentRef}
              variant="variation"
            />
          ))}
        </div>,
      );
    }

    path = nodePath;
    node = node.children[0];
    startsLine = false;
  }

  return <div className={`notation-line is-${variant}`}>{items}</div>;
}

export function MoveNotationPanel({ root, currentPath, onSelectPath }: MoveNotationPanelProps) {
  const currentMoveRef = useRef<HTMLButtonElement | null>(null);
  const nextPath = useMemo(() => firstChildPath(root, currentPath), [currentPath, root]);
  const lastPath = useMemo(() => lastMainlinePath(root, currentPath), [currentPath, root]);

  useEffect(() => {
    currentMoveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPath, root]);

  return (
    <aside className="notation-panel" aria-label="Move notation">
      <div className="notation-moves" role="list">
        {root.children.length === 0 ? (
          <p className="notation-placeholder">No moves yet</p>
        ) : (
          <div className="notation-tree" role="listitem">
            <MoveLine
              firstNode={root.children[0]}
              parentPath={[]}
              currentPath={currentPath}
              onSelectPath={onSelectPath}
              currentRef={currentMoveRef}
              variant="mainline"
            />
            {root.children.length > 1 ? (
              <div className="notation-variations is-root">
                {root.children.slice(1).map(child => (
                  <MoveLine
                    key={child.id}
                    firstNode={child}
                    parentPath={[]}
                    currentPath={currentPath}
                    onSelectPath={onSelectPath}
                    currentRef={currentMoveRef}
                    variant="variation"
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="notation-controls" aria-label="Move navigation">
        <button type="button" onClick={() => onSelectPath([])} disabled={currentPath.length === 0} aria-label="First move">
          |&lt;
        </button>
        <button
          type="button"
          onClick={() => onSelectPath(currentPath.slice(0, -1))}
          disabled={currentPath.length === 0}
          aria-label="Previous move"
        >
          &lt;
        </button>
        <button
          type="button"
          onClick={() => nextPath && onSelectPath(nextPath)}
          disabled={!nextPath}
          aria-label="Next move"
        >
          &gt;
        </button>
        <button
          type="button"
          onClick={() => onSelectPath(lastPath)}
          disabled={pathsEqual(currentPath, lastPath)}
          aria-label="Last move"
        >
          &gt;|
        </button>
      </div>
    </aside>
  );
}
