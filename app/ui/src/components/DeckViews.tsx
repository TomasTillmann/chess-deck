import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Deck } from "../decks";
import { deleteDeckView, fetchDeckViews, renameDeckView, type DeckView } from "../deckViewClient";
import { Button, StatusMessage } from "../design-system";

export function DeckViews({ decks, onPractice }: { decks: Deck[]; onPractice: (view: DeckView) => void }) {
  const headingId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const mutationLock = useRef(false);
  const [views, setViews] = useState<DeckView[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [renameError, setRenameError] = useState(false);
  const [deleting, setDeleting] = useState<DeckView>();
  const [deleteError, setDeleteError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    fetchDeckViews().then(result => {
      if (active) setViews(result);
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (deleting) {
      dialog.current?.showModal();
      cancelDelete.current?.focus();
    }
  }, [deleting]);

  function finishRename() {
    setEditingId(undefined);
    setRenameError(false);
    requestAnimationFrame(() => renameTrigger.current?.focus());
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!editingId || !name.trim() || mutationLock.current) return;
    mutationLock.current = true;
    setPending(true);
    setRenameError(false);
    try {
      const updated = await renameDeckView(editingId, name.trim());
      setViews(current => current.map(view => view.id === updated.id ? updated : view));
      finishRename();
    } catch {
      setRenameError(true);
    } finally {
      mutationLock.current = false;
      setPending(false);
    }
  }

  function closeDelete(deleted = false) {
    dialog.current?.close();
    setDeleting(undefined);
    setDeleteError(false);
    if (deleted) heading.current?.focus();
    else deleteTrigger.current?.focus();
  }

  async function confirmDelete() {
    if (!deleting || mutationLock.current) return;
    mutationLock.current = true;
    setPending(true);
    setDeleteError(false);
    try {
      await deleteDeckView(deleting.id);
      setViews(current => current.filter(view => view.id !== deleting.id));
      if (editingId === deleting.id) setEditingId(undefined);
      closeDelete(true);
    } catch {
      setDeleteError(true);
    } finally {
      mutationLock.current = false;
      setPending(false);
    }
  }

  return <section className="deck-views" aria-labelledby={headingId}>
    <h2 id={headingId} ref={heading} tabIndex={-1}>Deck Views</h2>
    {loading ? <StatusMessage role="status">Loading deck views…</StatusMessage>
      : loadError ? <div className="deck-view-feedback">
        <StatusMessage tone="danger" role="alert">Could not load deck views.</StatusMessage>
        <Button onClick={() => setLoadAttempt(current => current + 1)}>Retry</Button>
      </div>
      : views.length === 0 ? <p className="deck-views-empty">Select decks and click Practice to save a view.</p>
      : <ul className="deck-view-list">
        {views.map(view => <li className="deck-view-row" key={view.id}>
          <div className="deck-view-copy">
            {editingId === view.id ? <form className="deck-view-rename" onSubmit={saveName}>
              <label htmlFor={`${headingId}-name`}>View name</label>
              <div className="deck-view-rename-controls">
                <input id={`${headingId}-name`} value={name} onChange={event => setName(event.target.value)} autoFocus required maxLength={200} disabled={pending} />
                <Button type="submit" disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save"}</Button>
                <Button variant="ghost" disabled={pending} onClick={finishRename}>Cancel</Button>
              </div>
              {renameError && <StatusMessage tone="danger" role="alert">Could not rename this view. Try saving again.</StatusMessage>}
            </form> : <h3>{view.name}</h3>}
            <p>{view.collections.map(slug => decks.find(deck => deck.slug === slug)?.name ?? `${slug} (unavailable)`).join(" + ")}</p>
          </div>
          <div className="deck-view-actions">
            <Button onClick={() => onPractice(view)} disabled={pending} aria-label={`Practice ${view.name}`}>Practice</Button>
            <Button variant="ghost" disabled={pending || editingId === view.id} aria-label={`Rename ${view.name}`} onClick={event => {
              renameTrigger.current = event.currentTarget;
              setEditingId(view.id);
              setName(view.name);
              setRenameError(false);
            }}>Rename</Button>
            <Button variant="ghost" disabled={pending} aria-label={`Delete ${view.name}`} onClick={event => {
              deleteTrigger.current = event.currentTarget;
              setDeleting(view);
              setDeleteError(false);
            }}>Delete</Button>
          </div>
        </li>)}
      </ul>}
    <dialog className="view-dialog" ref={dialog} aria-labelledby={dialogTitleId} aria-describedby={dialogDescriptionId} onCancel={event => {
      event.preventDefault();
      if (!mutationLock.current) closeDelete();
    }}>
      <h2 id={dialogTitleId}>Delete deck view</h2>
      <p id={dialogDescriptionId}>Delete “{deleting?.name}”? Your decks and puzzle progress will stay unchanged.</p>
      {deleteError && <StatusMessage tone="danger" role="alert">Could not delete this view. Try again.</StatusMessage>}
      <div className="view-dialog-actions">
        <Button ref={cancelDelete} disabled={pending} onClick={() => closeDelete()}>Cancel</Button>
        <Button variant="danger" disabled={pending} onClick={() => void confirmDelete()}>{pending ? "Deleting…" : "Delete view"}</Button>
      </div>
    </dialog>
  </section>;
}
