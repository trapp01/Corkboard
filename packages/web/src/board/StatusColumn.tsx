/**
 * One status as a column: a header (drag handle, name to rename in place,
 * card count, kind marker, menu), its cards scrolling inside, and "Add a
 * card" under it. The column is only as tall as its content.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, Archive, Check, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { archiveStatus, cardLabels, moveStatus, restoreStatus, updateStatus, type Card, type Status, type StatusKind } from '@corkboard/model';
import { IconButton, Menu, type MenuItem } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { patchUi } from '../app/ui-state.js';
import { CardFront } from '../card/CardFront.js';
import { useCurrentBoard } from './board-context.js';
import type { DragData } from './BoardView.js';
import { CardComposer } from './CardComposer.js';
import { KindMarker, KIND_NAMES } from './KindMarker.js';

export function StatusColumn({
  status,
  index,
  statusCount,
  cards,
  totalCards,
  filtering,
  flashing,
  draggingCardId,
}: {
  status: Status;
  index: number;
  statusCount: number;
  /** The cards showing, in order (during a drag, where the drag puts them). */
  cards: Card[];
  /** Every card in the status, filtered out or not. */
  totalCards: number;
  filtering: boolean;
  flashing: ReadonlySet<string>;
  draggingCardId: string | null;
}) {
  const services = useServices();
  const { ui, hover, toasts } = services;
  const { doc, board, entry } = useCurrentBoard();
  const composerOpen = useStore(ui).composer === status.id;
  const sortable = useSortable({ id: `status:${status.id}`, data: { type: 'status', statusId: status.id } satisfies DragData });
  const body = useDroppable({ id: `column:${status.id}`, data: { type: 'column', statusId: status.id } satisfies DragData });
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // A press that ends a header drag must not also open the rename field.
  const lastDragEnd = useRef(0);
  const wasDragging = useRef(false);
  useEffect(() => {
    if (wasDragging.current && !sortable.isDragging) lastDragEnd.current = Date.now();
    wasDragging.current = sortable.isDragging;
  }, [sortable.isDragging]);

  const archive = () => {
    archiveStatus(doc, status.id);
    toasts.show(`Archived ${status.name}${totalCards > 0 ? ` and its ${totalCards === 1 ? 'card' : `${totalCards} cards`}` : ''}`, () =>
      restoreStatus(doc, status.id),
    );
  };
  const kindItem = (kind: StatusKind): MenuItem => ({
    label: `Kind: ${KIND_NAMES[kind]}`,
    checked: status.kind === kind,
    icon: status.kind === kind ? <Check size={16} /> : undefined,
    onSelect: () => updateStatus(doc, status.id, { kind }),
  });

  const count = filtering ? `${cards.length} of ${totalCards}` : String(totalCards);
  return (
    <section
      ref={sortable.setNodeRef}
      className={`status-column kind-${status.kind} ${sortable.isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      aria-label={`${status.name}, ${KIND_NAMES[status.kind]}`}
      data-status-id={status.id}
      onPointerEnter={() => hover.set({ ...hover.get(), statusId: status.id })}
      onPointerLeave={() => hover.get().statusId === status.id && hover.set({ statusId: null, cardId: null })}
    >
      <header className="status-header" {...sortable.attributes} {...sortable.listeners} aria-roledescription="draggable status" aria-label={`Move status ${status.name}`}>
        <KindMarker kind={status.kind} />
        {renaming ? (
          <RenameStatus status={status} onDone={() => setRenaming(false)} />
        ) : (
          <h2 className="status-name">
            <button
              type="button"
              className="status-name-button"
              onClick={() => Date.now() - lastDragEnd.current > 300 && setRenaming(true)}
              onKeyDown={(e) => e.stopPropagation()}
              title="Rename"
            >
              {status.name}
            </button>
          </h2>
        )}
        <span className="status-count" aria-label={`${count} cards`}>
          {count}
        </span>
        <IconButton
          ref={menuButton}
          label={`${status.name} actions`}
          className="status-menu-button"
          onClick={() => setMenuOpen((o) => !o)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal size={18} />
        </IconButton>
      </header>
      {menuOpen && (
        <Menu
          label={`${status.name} actions`}
          anchor={menuButton.current}
          onClose={() => setMenuOpen(false)}
          items={[
            { label: 'Rename', icon: <Pencil size={16} />, onSelect: () => setRenaming(true) },
            'separator',
            kindItem('todo'),
            kindItem('doing'),
            kindItem('done'),
            'separator',
            { label: 'Move left', icon: <ArrowLeft size={16} />, disabled: index === 0, onSelect: () => moveStatus(doc, status.id, index - 1) },
            { label: 'Move right', icon: <ArrowRight size={16} />, disabled: index === statusCount - 1, onSelect: () => moveStatus(doc, status.id, index + 1) },
            'separator',
            { label: 'Archive status', icon: <Archive size={16} />, onSelect: archive },
          ]}
        />
      )}
      {composerOpen ? (
        <CardComposer statusId={status.id} onAdded={() => body.node.current?.scrollTo({ top: 0 })} onClose={() => patchUi(ui, { composer: null })} />
      ) : (
        <button type="button" className="add-card-button" onClick={() => patchUi(ui, { composer: status.id })}>
          <Plus size={16} aria-hidden="true" />
          Add a card
        </button>
      )}
      <div ref={body.setNodeRef} className="status-cards">
        <SortableContext items={cards.map((card) => `card:${card.id}`)} strategy={verticalListSortingStrategy}>
          <ol className="card-list">
            {cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                status={status}
                disabled={filtering}
                flashing={flashing.has(card.id)}
                placeholder={card.id === draggingCardId}
                labels={cardLabels(board, card)}
                boardKey={entry.key}
              />
            ))}
          </ol>
        </SortableContext>
      </div>
    </section>
  );
}

function SortableCard({
  card,
  status,
  disabled,
  flashing,
  placeholder,
  labels,
  boardKey,
}: {
  card: Card;
  status: Status;
  disabled: boolean;
  flashing: boolean;
  placeholder: boolean;
  labels: ReturnType<typeof cardLabels>;
  boardKey: string;
}) {
  const { hover } = useServices();
  const sortable = useSortable({ id: `card:${card.id}`, data: { type: 'card', cardId: card.id } satisfies DragData, disabled });
  return (
    <li
      ref={sortable.setNodeRef}
      className={`card-slot ${placeholder ? 'is-placeholder' : ''}`}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      onPointerEnter={() => hover.set({ statusId: status.id, cardId: card.id })}
      onPointerLeave={() => hover.set({ ...hover.get(), cardId: null })}
    >
      <CardFront
        card={card}
        labels={labels}
        boardKey={boardKey}
        kind={status.kind}
        flashing={flashing}
        dragHandle={{ ...sortable.attributes, ...sortable.listeners, role: undefined, 'aria-roledescription': disabled ? undefined : 'draggable card' }}
      />
    </li>
  );
}

function RenameStatus({ status, onDone }: { status: Status; onDone: () => void }) {
  const { doc } = useCurrentBoard();
  const [name, setName] = useState(status.name);
  const save = () => {
    if (name.trim() !== '' && name.trim() !== status.name) updateStatus(doc, status.id, { name });
    onDone();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') {
      event.preventDefault();
      onDone();
    }
  };
  return (
    <input
      className="status-rename"
      aria-label="Status name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      autoFocus
      onFocus={(e) => e.target.select()}
      maxLength={60}
    />
  );
}
