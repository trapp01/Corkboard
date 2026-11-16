/**
 * The board: its statuses side by side, scrolling sideways, and the "Add a
 * status" tile after the last. Cards drag within and between statuses and
 * statuses drag by their header, by pointer, touch (press and hold) or
 * keyboard (Space to lift, arrows to move, Space to drop). Card dragging is off
 * while a filter hides cards, since a place among hidden cards is ambiguous.
 */
import { useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { cardLabels, cardsInStatus, moveCard, moveStatus, restoreBoard, type Card } from '@corkboard/model';
import { useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { CardFront } from '../card/CardFront.js';
import { AddStatus } from './AddStatus.js';
import type { CurrentBoard } from './board-context.js';
import { columnOf, dragOver, dropPlace, samePlace, type Columns } from './drag-model.js';
import { liveFilter, matchingCardIds } from './filter.js';
import { StatusColumn } from './StatusColumn.js';

export type DragData = { type: 'card'; cardId: string } | { type: 'column'; statusId: string } | { type: 'status'; statusId: string };

type Drag = { kind: 'card'; cardId: string; start: Columns; columns: Columns } | { kind: 'status'; statusId: string };

const dataOf = (item: { data: { current?: unknown } } | null | undefined): DragData | undefined => item?.data.current as DragData | undefined;

/** Statuses collide with statuses only. Cards prefer the card under the pointer, then a status's empty space, then the nearest card. */
const collision: CollisionDetection = (args) => {
  const type = dataOf(args.active)?.type;
  if (type === 'status') {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => dataOf(c)?.type === 'status') });
  }
  const targets = args.droppableContainers.filter((c) => dataOf(c)?.type === 'card' || dataOf(c)?.type === 'column');
  const within = pointerWithin({ ...args, droppableContainers: targets });
  const card = within.find((hit) => dataOf(targets.find((c) => c.id === hit.id))?.type === 'card');
  if (card) return [card];
  if (within.length > 0) return within;
  return closestCorners({ ...args, droppableContainers: targets });
};

export function BoardView({ current }: { current: CurrentBoard }) {
  const { ui, actor, workspace } = useServices();
  const { doc, board, entry, flashing } = current;
  const filterState = useStore(ui).filter;
  const filter = liveFilter(board, filterState);
  const matches = useMemo(() => matchingCardIds(board, filter), [board, filter]);
  const filtering = matches !== null;
  const shown = useMemo<Columns>(
    () =>
      Object.fromEntries(
        board.statuses.map((status) => [status.id, cardsInStatus(board, status.id).filter((card) => matches === null || matches.has(card.id)).map((card) => card.id)]),
      ),
    [board, matches],
  );
  const cardsById = useMemo(() => new Map(board.cards.map((card) => [card.id, card])), [board]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // The drop reads the drag from here: drag-over updates may not have re-rendered yet when it lands.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null | ((current: Drag | null) => Drag | null)) => {
    dragRef.current = typeof next === 'function' ? next(dragRef.current) : next;
    setDragState(dragRef.current);
  };
  const columns = drag?.kind === 'card' ? drag.columns : shown;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const data = dataOf(active);
    if (data?.type === 'card') setDrag({ kind: 'card', cardId: data.cardId, start: shown, columns: shown });
    else if (data?.type === 'status') setDrag({ kind: 'status', statusId: data.statusId });
  };

  // Crossing into another status moves the card there while dragging; order inside one status is the sortable's job until the drop.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const target = dataOf(over);
    const moving = active.rect.current.translated;
    const below = over !== null && moving !== null && moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2;
    setDrag((current) => {
      if (current?.kind !== 'card' || !target) return current;
      const from = columnOf(current.columns, current.cardId);
      let next = current.columns;
      // Anywhere on another status that is not one of its cards (its header, its "Add a card" row) counts as that status.
      if ((target.type === 'column' || target.type === 'status') && target.statusId !== from) {
        next = dragOver(current.columns, current.cardId, { kind: 'status', statusId: target.statusId });
      } else if (target.type === 'card' && columnOf(current.columns, target.cardId) !== from) {
        next = dragOver(current.columns, current.cardId, { kind: 'card', cardId: target.cardId, below });
      }
      return next === current.columns ? current : { ...current, columns: next };
    });
  };

  // A card lands where the drag shows it, even when the pointer ends outside every status.
  const onDragEnd = ({ over }: DragEndEvent) => {
    const drag = dragRef.current;
    setDrag(null);
    if (!drag) return;
    if (drag.kind === 'status') {
      const target = dataOf(over);
      if (target?.type !== 'status' || target.statusId === drag.statusId) return;
      moveStatus(doc, drag.statusId, board.statuses.findIndex((status) => status.id === target.statusId));
      return;
    }
    let final = drag.columns;
    const target = dataOf(over);
    if (target?.type === 'card' && target.cardId !== drag.cardId) final = dragOver(final, drag.cardId, { kind: 'card', cardId: target.cardId, below: false });
    if (samePlace(drag.start, final, drag.cardId)) return;
    const place = dropPlace(final, drag.cardId);
    if (place) moveCard(doc, drag.cardId, { statusId: place.statusId, place: place.index }, actor.get());
  };

  const dragged = drag?.kind === 'card' ? cardsById.get(drag.cardId) : undefined;
  const statusOf = (card: Card) => board.statuses.find((status) => shown[status.id]?.includes(card.id)) ?? null;

  return (
    <div className="board-frame">
      {entry.archivedAt !== null && (
        <div className="banner">
          This board is archived.{' '}
          <button type="button" className="button subtle" onClick={() => restoreBoard(workspace, entry.id)}>
            Restore board
          </button>
        </div>
      )}
      {filtering && <p className="drag-hint">Dragging cards is off while filters are on. Clear filters to move cards by dragging.</p>}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
        <div className="board" data-testid="board">
          <SortableContext items={board.statuses.map((status) => `status:${status.id}`)} strategy={horizontalListSortingStrategy}>
            {board.statuses.map((status, index) => (
              <StatusColumn
                key={status.id}
                status={status}
                index={index}
                statusCount={board.statuses.length}
                cards={(columns[status.id] ?? []).map((id) => cardsById.get(id)).filter((card): card is Card => card !== undefined)}
                totalCards={cardsInStatus(board, status.id).length}
                filtering={filtering}
                flashing={flashing}
                draggingCardId={drag?.kind === 'card' ? drag.cardId : null}
              />
            ))}
          </SortableContext>
          <AddStatus />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <CardFront card={dragged} labels={cardLabels(board, dragged)} boardKey={entry.key} kind={statusOf(dragged)?.kind ?? null} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
