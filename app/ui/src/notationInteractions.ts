/** Reveal a move inside the notation pane without scrolling its page ancestors. */
export function revealNotationMove(container: HTMLElement, move: HTMLElement) {
  const bounds = container.getBoundingClientRect();
  const target = move.getBoundingClientRect();
  const top = bounds.top + container.clientTop;
  const left = bounds.left + container.clientLeft;
  if (target.top < top) container.scrollTop += target.top - top;
  else if (target.bottom > top + container.clientHeight) container.scrollTop += target.bottom - top - container.clientHeight;
  if (target.left < left) container.scrollLeft += target.left - left;
  else if (target.right > left + container.clientWidth) container.scrollLeft += target.right - left - container.clientWidth;
}

export function fitMoveMenu(
  menu: HTMLElement,
  x: number,
  y: number,
  viewport: { left: number; top: number; width: number; height: number },
) {
  const margin = 8;
  menu.style.maxWidth = `${Math.max(0, viewport.width - margin * 2)}px`;
  menu.style.maxHeight = `${Math.max(0, viewport.height - margin * 2)}px`;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(viewport.left + margin, Math.min(x, viewport.left + viewport.width - bounds.width - margin))}px`;
  menu.style.top = `${Math.max(viewport.top + margin, Math.min(y, viewport.top + viewport.height - bounds.height - margin))}px`;
}

export function focusMoveMenuItem(menu: HTMLElement, key: string, activeElement: Element | null) {
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
  const current = items.indexOf(activeElement as HTMLButtonElement);
  const index = key === "Home" ? 0 : key === "End" ? items.length - 1
    : key === "ArrowDown" ? (current + 1) % items.length
      : key === "ArrowUp" ? (current <= 0 ? items.length - 1 : current - 1) : undefined;
  if (index === undefined) return false;
  items[index]?.focus({ preventScroll: true });
  return true;
}
