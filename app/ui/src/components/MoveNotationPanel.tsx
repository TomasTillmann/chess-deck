import { useEffect, useMemo, useRef, useState, type Ref } from "react";

import {
  childPath,
  firstChildPath,
  lastMainlinePath,
  nodeAtPath,
  pathsEqual,
  siblingIndexAtPath,
  type MovePath,
  type MoveTreeNode,
} from "../gameTree";

type MoveNotationPanelProps = {
  root: MoveTreeNode;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
  onDeletePath: (path: MovePath) => void;
  onMovePathUp: (path: MovePath) => void;
  onMovePathDown: (path: MovePath) => void;
};

type MoveMenuState = {
  path: MovePath;
  x: number;
  y: number;
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
  onOpenMenu,
  currentRef,
}: {
  node: MoveTreeNode;
  path: MovePath;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
  onOpenMenu: (path: MovePath, x: number, y: number) => void;
  currentRef?: Ref<HTMLButtonElement>;
}) {
  if (!node.move) return null;

  const isCurrent = pathsEqual(path, currentPath);
  const reviewDescription = node.review === "solution-missing" ? "Missed required move"
    : node.review === "solution-alternative" ? "Accepted alternative — not required"
      : node.review === "user-extra" ? "Extra analysis — no score penalty" : undefined;
  const classes = ["notation-move"];
  if (node.review === "solution-missing") classes.push("is-review-solution-missing");
  if (node.review === "user-extra") classes.push("is-review-user-extra");
  if (node.review === "solution-alternative") classes.push("is-review-user-extra");
  if (isCurrent) classes.push("is-current");

  return (
    <button
      ref={isCurrent ? currentRef : undefined}
      type="button"
      className={classes.join(" ")}
      onClick={() => onSelectPath(path)}
      onContextMenu={event => {
        event.preventDefault();
        onOpenMenu(path, event.clientX, event.clientY);
      }}
      aria-current={isCurrent ? "step" : undefined}
      aria-description={reviewDescription}
      title={reviewDescription}
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
  onOpenMenu,
  currentRef,
}: {
  node: MoveTreeNode;
  path: MovePath;
  currentPath: MovePath;
  startsLine: boolean;
  onSelectPath: (path: MovePath) => void;
  onOpenMenu: (path: MovePath, x: number, y: number) => void;
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
        onOpenMenu={onOpenMenu}
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
  onOpenMenu,
  currentRef,
  variant,
}: {
  firstNode: MoveTreeNode;
  parentPath: MovePath;
  currentPath: MovePath;
  onSelectPath: (path: MovePath) => void;
  onOpenMenu: (path: MovePath, x: number, y: number) => void;
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
        onOpenMenu={onOpenMenu}
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
              onOpenMenu={onOpenMenu}
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

export function MoveNotationPanel({
  root,
  currentPath,
  onSelectPath,
  onDeletePath,
  onMovePathUp,
  onMovePathDown,
}: MoveNotationPanelProps) {
  const currentMoveRef = useRef<HTMLButtonElement | null>(null);
  const [moveMenu, setMoveMenu] = useState<MoveMenuState>();
  const nextPath = useMemo(() => firstChildPath(root, currentPath), [currentPath, root]);
  const lastPath = useMemo(() => lastMainlinePath(root, currentPath), [currentPath, root]);
  const menuSiblingIndex = moveMenu ? siblingIndexAtPath(root, moveMenu.path) : -1;
  const menuSiblingCount = moveMenu ? nodeAtPath(root, moveMenu.path.slice(0, -1)).children.length : 0;
  const canMoveMenuUp = menuSiblingIndex > 0;
  const canMoveMenuDown = menuSiblingIndex >= 0 && menuSiblingIndex < menuSiblingCount - 1;

  function closeMoveMenu() {
    setMoveMenu(undefined);
  }

  function handleMenuAction(action: (path: MovePath) => void) {
    if (!moveMenu) return;

    const path = moveMenu.path;
    closeMoveMenu();
    action(path);
  }

  useEffect(() => {
    currentMoveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPath, root]);

  useEffect(() => {
    if (!moveMenu) return undefined;

    const handlePointerDown = () => closeMoveMenu();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMoveMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveMenu]);

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
              onOpenMenu={(path, x, y) => setMoveMenu({ path, x, y })}
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
                    onOpenMenu={(path, x, y) => setMoveMenu({ path, x, y })}
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
      {moveMenu ? (
        <div
          className="notation-context-menu"
          style={{ left: moveMenu.x, top: moveMenu.y }}
          role="menu"
          onPointerDown={event => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => handleMenuAction(onDeletePath)}>
            Delete
          </button>
          <button type="button" role="menuitem" onClick={() => handleMenuAction(onMovePathUp)} disabled={!canMoveMenuUp}>
            Up
          </button>
          <button type="button" role="menuitem" onClick={() => handleMenuAction(onMovePathDown)} disabled={!canMoveMenuDown}>
            Down
          </button>
        </div>
      ) : null}
    </aside>
  );
}
