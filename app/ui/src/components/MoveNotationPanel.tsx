import { useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { Button, Icon, type ThemeProps } from "../design-system";
import { fitMoveMenu, focusMoveMenuItem, revealNotationMove } from "../notationInteractions";

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

type MoveNotationPanelProps = ThemeProps & {
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
  opener: HTMLButtonElement;
};

type OpenMoveMenu = (path: MovePath, x: number, y: number, opener: HTMLButtonElement) => void;

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
  onOpenMenu: OpenMoveMenu;
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
    <Button
      ref={isCurrent ? currentRef : undefined}
      type="button"
      className={classes.join(" ")}
      variant="ghost"
      size="compact"
      onClick={() => onSelectPath(path)}
      onContextMenu={event => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const keyboard = event.clientX === 0 && event.clientY === 0;
        onOpenMenu(path, keyboard ? bounds.left : event.clientX, keyboard ? bounds.bottom : event.clientY, event.currentTarget);
      }}
      onKeyDown={event => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        onOpenMenu(path, bounds.left, bounds.bottom, event.currentTarget);
      }}
      aria-haspopup="menu"
      aria-current={isCurrent ? "step" : undefined}
      aria-description={reviewDescription}
      title={reviewDescription}
    >
      {node.move.san}
    </Button>
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
  onOpenMenu: OpenMoveMenu;
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
  onOpenMenu: OpenMoveMenu;
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
  theme,
}: MoveNotationPanelProps) {
  const currentMoveRef = useRef<HTMLButtonElement | null>(null);
  const movesRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const [moveMenu, setMoveMenu] = useState<MoveMenuState>();
  const nextPath = useMemo(() => firstChildPath(root, currentPath), [currentPath, root]);
  const lastPath = useMemo(() => lastMainlinePath(root, currentPath), [currentPath, root]);
  const menuSiblingIndex = moveMenu ? siblingIndexAtPath(root, moveMenu.path) : -1;
  const menuSiblingCount = moveMenu ? nodeAtPath(root, moveMenu.path.slice(0, -1)).children.length : 0;
  const canMoveMenuUp = menuSiblingIndex > 0;
  const canMoveMenuDown = menuSiblingIndex >= 0 && menuSiblingIndex < menuSiblingCount - 1;

  function closeMoveMenu(restoreFocus = false) {
    if (restoreFocus && moveMenu) restoreFocusRef.current = moveMenu.opener;
    setMoveMenu(undefined);
  }

  const openMoveMenu: OpenMoveMenu = (path, x, y, opener) => setMoveMenu({ path, x, y, opener });

  function handleMenuAction(action: (path: MovePath) => void) {
    if (!moveMenu) return;

    const path = moveMenu.path;
    closeMoveMenu(true);
    action(path);
  }

  useLayoutEffect(() => {
    if (movesRef.current && currentMoveRef.current) revealNotationMove(movesRef.current, currentMoveRef.current);
  }, [currentPath, root]);

  useLayoutEffect(() => {
    if (!moveMenu) {
      const opener = restoreFocusRef.current;
      if (opener) (opener.isConnected ? opener : currentMoveRef.current ?? movesRef.current)?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
      return;
    }
    const menu = menuRef.current;
    if (!menu) return;
    const positionMenu = () => {
      const viewport = window.visualViewport;
      fitMoveMenu(menu, moveMenu.x, moveMenu.y, {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? document.documentElement.clientWidth,
        height: viewport?.height ?? document.documentElement.clientHeight,
      });
    };
    positionMenu();
    focusMoveMenuItem(menu, "Home", document.activeElement);

    const handlePointerDown = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) closeMoveMenu();
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (!menu.contains(event.target as Node)) closeMoveMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("focusin", handleFocusOut);
    window.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("scroll", positionMenu);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("focusin", handleFocusOut);
      window.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("scroll", positionMenu);
    };
  }, [moveMenu]);

  return (
    <aside className="notation-panel" data-theme={theme} aria-label="Move notation">
      <div className="notation-heading">Analysis</div>
      <div ref={movesRef} className="notation-moves" role="list" tabIndex={-1}>
        {root.children.length === 0 ? (
          <p className="notation-placeholder">No moves yet</p>
        ) : (
          <div className="notation-tree" role="listitem">
            <MoveLine
              firstNode={root.children[0]}
              parentPath={[]}
              currentPath={currentPath}
              onSelectPath={onSelectPath}
              onOpenMenu={openMoveMenu}
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
                    onOpenMenu={openMoveMenu}
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
        <Button variant="ghost" size="icon" type="button" onClick={() => onSelectPath([])} disabled={currentPath.length === 0} aria-label="First move">
          <Icon name="first" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => onSelectPath(currentPath.slice(0, -1))}
          disabled={currentPath.length === 0}
          aria-label="Previous move"
        >
          <Icon name="chevron-left" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => nextPath && onSelectPath(nextPath)}
          disabled={!nextPath}
          aria-label="Next move"
        >
          <Icon name="chevron-right" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => onSelectPath(lastPath)}
          disabled={pathsEqual(currentPath, lastPath)}
          aria-label="Last move"
        >
          <Icon name="last" />
        </Button>
      </div>
      {moveMenu ? (
        <div
          ref={menuRef}
          className="notation-context-menu"
          style={{ left: moveMenu.x, top: moveMenu.y, overflowY: "auto", minWidth: 0, width: 142 }}
          role="menu"
          aria-label="Move actions"
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              closeMoveMenu(true);
            } else if (event.key === "Tab") {
              moveMenu.opener.focus({ preventScroll: true });
              closeMoveMenu();
            } else if (focusMoveMenuItem(event.currentTarget, event.key, document.activeElement)) {
              event.preventDefault();
            }
          }}
        >
          <Button variant="ghost" type="button" role="menuitem" tabIndex={-1} onClick={() => handleMenuAction(onDeletePath)}>
            Delete
          </Button>
          <Button variant="ghost" type="button" role="menuitem" tabIndex={-1} onClick={() => handleMenuAction(onMovePathUp)} disabled={!canMoveMenuUp}>
            Up
          </Button>
          <Button variant="ghost" type="button" role="menuitem" tabIndex={-1} onClick={() => handleMenuAction(onMovePathDown)} disabled={!canMoveMenuDown}>
            Down
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
