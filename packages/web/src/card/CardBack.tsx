/**
 * The card back: everything on one card, open over its board at /c/<ref>.
 * Escape or a press on the backdrop closes it and returns to /b/<key>. The
 * main column holds the title, labels, description, checklist, links,
 * attachments and timeline; the side column holds status, labels, due day
 * and the actions. Files dropped or pasted anywhere on it become attachments.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Archive, ArchiveRestore, Copy, Link as LinkIcon, Tag, X } from 'lucide-react';
import { boardPath, cardLabels, formatCardRef, moveCard, restoreCard, shownStatusId, updateCard, type Card } from '@corkboard/model';
import { Dialog, IconButton, Modal } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useCurrentBoard } from '../board/board-context.js';
import { KindMarker } from '../board/KindMarker.js';
import { LabelChip } from '../labels/LabelChip.js';
import { LabelPicker } from '../labels/LabelPicker.js';
import { useSyncStatus } from '../sync-ui/use-sync-status.js';
import { archiveWithUndo, copyCardLink, copyCardRef } from './card-actions.js';
import { CardAttachments, useAttachFiles } from './CardAttachments.js';
import { CardChecklist } from './CardChecklist.js';
import { CardDescription } from './CardDescription.js';
import { CardLinks } from './CardLinks.js';
import { CardTimeline } from './CardTimeline.js';

export function CardBack({ card }: { card: Card }) {
  const services = useServices();
  const { router, actor } = services;
  const { doc, board, entry } = useCurrentBoard();
  const ref = formatCardRef(entry.key, card.number);
  const close = () => router.navigate(boardPath(entry.key));
  const statusId = shownStatusId(board, card);
  const status = board.statuses.find((candidate) => candidate.id === statusId) ?? null;
  const labels = cardLabels(board, card);
  const labelButton = useRef<HTMLButtonElement>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const attach = useAttachFiles(card);
  const [dropping, setDropping] = useState(false);
  const archived = card.archivedAt !== null;

  useEffect(() => {
    document.title = `${ref} ${card.title} · Corkboard`;
    return () => {
      document.title = 'Corkboard';
    };
  }, [ref, card.title]);

  return (
    <Modal
      label={`${ref}: ${card.title}`}
      onClose={close}
      className={`card-back ${dropping ? 'is-dropping' : ''}`}
      backdropClassName="card-back-backdrop"
    >
      <div
        className="card-back-inner"
        tabIndex={-1}
        data-autofocus
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length === 0) return;
          event.preventDefault();
          void attach(files);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          setDropping(false);
          void attach([...event.dataTransfer.files]);
        }}
      >
        <header className="card-back-header">
          <div className="card-back-topline">
            <span className="card-back-ref">{ref}</span>
            {status && (
              <span className="card-back-where">
                <KindMarker kind={status.kind} size={14} />
                {status.name}
              </span>
            )}
            <span className="spacer" />
            <IconButton label="Close card" className="dialog-close" onClick={close}>
              <X size={20} />
            </IconButton>
          </div>
          <TitleField card={card} />
          {archived && (
            <div className="banner card-banner">
              This card is archived.
              <button type="button" className="button subtle" onClick={() => restoreCard(doc, card.id, actor.get())}>
                Restore
              </button>
            </div>
          )}
        </header>
        <div className="card-back-body">
          <div className="card-back-main">
            {labels.length > 0 && (
              <div className="card-back-labels" aria-label="Labels">
                {labels.map((label) => (
                  <LabelChip key={label.id} label={label} />
                ))}
              </div>
            )}
            <CardDescription card={card} />
            <CardChecklist card={card} />
            <CardLinks card={card} />
            <CardAttachments card={card} onPick={attach} />
            <CardTimeline card={card} />
          </div>
          <aside className="card-back-side" aria-label="Card details">
            <label className="field">
              <span>Status</span>
              <select
                value={statusId ?? ''}
                onChange={(e) => moveCard(doc, card.id, { statusId: e.target.value, place: 'bottom' }, actor.get())}
              >
                {statusId === null && <option value="">Archived status</option>}
                {board.statuses.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span id="labels-field">Labels</span>
              <button
                ref={labelButton}
                type="button"
                className="button side-button"
                onClick={() => setLabelsOpen((o) => !o)}
                aria-expanded={labelsOpen}
                aria-describedby="labels-field"
              >
                <Tag size={16} aria-hidden="true" />
                {labels.length === 0 ? 'Add labels' : 'Edit labels'}
              </button>
            </div>
            <DueField card={card} />
            <div className="side-actions">
              <span className="side-heading">Actions</span>
              <button type="button" className="button side-button" onClick={() => void copyCardRef(services, card, entry.key)}>
                <Copy size={16} aria-hidden="true" />
                Copy ref
              </button>
              <button type="button" className="button side-button" onClick={() => void copyCardLink(services, card, entry.key)}>
                <LinkIcon size={16} aria-hidden="true" />
                Copy link
              </button>
              {archived ? (
                <button type="button" className="button side-button" onClick={() => restoreCard(doc, card.id, actor.get())}>
                  <ArchiveRestore size={16} aria-hidden="true" />
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="button side-button"
                  onClick={() => {
                    archiveWithUndo(services, doc, card, entry.key);
                    close();
                  }}
                >
                  <Archive size={16} aria-hidden="true" />
                  Archive
                </button>
              )}
            </div>
          </aside>
        </div>
        {dropping && <div className="drop-veil">Drop to attach</div>}
      </div>
      {labelsOpen && <LabelPicker card={card} anchor={labelButton.current} onClose={() => setLabelsOpen(false)} />}
    </Modal>
  );
}

/** The title, edited in place. Enter or leaving the field saves; Escape puts back what was there. */
function TitleField({ card }: { card: Card }) {
  const { doc } = useCurrentBoard();
  const [draft, setDraft] = useState(card.title);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) setDraft(card.title);
  }, [card.title, editing]);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);
  const save = () => {
    setEditing(false);
    if (draft.trim() !== '' && draft.trim() !== card.title) updateCard(doc, card.id, { title: draft });
    else setDraft(card.title);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      field.current?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(card.title);
      setEditing(false);
      requestAnimationFrame(() => field.current?.blur());
    }
  };
  return (
    <textarea
      ref={field}
      className="card-back-title"
      aria-label="Card title"
      value={draft}
      rows={1}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onBlur={save}
      onKeyDown={onKeyDown}
      maxLength={300}
    />
  );
}

function DueField({ card }: { card: Card }) {
  const { doc } = useCurrentBoard();
  return (
    <div className="field">
      <label htmlFor="card-due">Due day</label>
      <div className="due-row">
        <input id="card-due" type="date" value={card.due ?? ''} onChange={(e) => updateCard(doc, card.id, { due: e.target.value || null })} />
        {card.due !== null && (
          <IconButton label="Clear due day" onClick={() => updateCard(doc, card.id, { due: null })}>
            <X size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** Shown at /c/<ref> when the board has no card with that number. */
export function MissingCard({ boardKey, number }: { boardKey: string; number: number }) {
  const { router, client } = useServices();
  const status = useSyncStatus(client);
  const ref = formatCardRef(boardKey, number);
  const waiting = status.state === 'connecting' || status.state === 'syncing';
  return (
    <Dialog title={waiting ? `Looking for ${ref}…` : `No card ${ref}`} onClose={() => router.navigate(boardPath(boardKey))}>
      <p className="muted">{waiting ? 'This device is still catching up with the server.' : `${boardKey} has no card numbered ${number}.`}</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => router.navigate(boardPath(boardKey))}>
          Back to the board
        </button>
      </div>
    </Dialog>
  );
}
