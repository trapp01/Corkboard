/** Writing a board's statuses (its columns) and labels. */
import * as Y from 'yjs';
import { labelsMap, readBoard, statusesMap, type Label, type Status, type StatusKind } from './board.js';
import { leastUsedColor, type ColorName } from './colors.js';
import { newId } from './ids.js';
import { orderAt } from './order.js';

/** The statuses a new board starts with. */
export const DEFAULT_STATUSES: ReadonlyArray<{ name: string; kind: StatusKind }> = [
  { name: 'Backlog', kind: 'todo' },
  { name: 'This week', kind: 'todo' },
  { name: 'In progress', kind: 'doing' },
  { name: 'Blocked', kind: 'doing' },
  { name: 'Done', kind: 'done' },
];

/** Adds DEFAULT_STATUSES to a board that has none. */
export function createDefaultStatuses(doc: Y.Doc): void {
  if (statusesMap(doc).size > 0) return;
  doc.transact(() => {
    for (const status of DEFAULT_STATUSES) createStatus(doc, status);
  });
}

/** Adds a status at `index` among the board's statuses; at the end when left out. */
export function createStatus(doc: Y.Doc, input: { name: string; kind?: StatusKind; index?: number }): Status {
  const siblings = readBoard(doc).statuses;
  const status: Status = {
    id: newId(),
    name: input.name.trim() || 'Untitled',
    kind: input.kind ?? 'todo',
    order: orderAt(siblings, input.index ?? siblings.length),
    archivedAt: null,
  };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    map.set('name', status.name);
    map.set('kind', status.kind);
    map.set('order', status.order);
    map.set('archivedAt', null);
    statusesMap(doc).set(status.id, map);
  });
  return status;
}

function requireStatus(doc: Y.Doc, statusId: string): Y.Map<unknown> {
  const map = statusesMap(doc).get(statusId);
  if (map === undefined) throw new Error(`No status has the id "${statusId}"`);
  return map;
}

export function updateStatus(doc: Y.Doc, statusId: string, changes: { name?: string; kind?: StatusKind }): void {
  const map = requireStatus(doc, statusId);
  doc.transact(() => {
    if (changes.name !== undefined && changes.name.trim() !== '') map.set('name', changes.name.trim());
    if (changes.kind !== undefined) map.set('kind', changes.kind);
  });
}

/** Moves a status to `index` among the statuses that are not archived. */
export function moveStatus(doc: Y.Doc, statusId: string, index: number): void {
  const map = requireStatus(doc, statusId);
  const others = readBoard(doc).statuses.filter((status) => status.id !== statusId);
  map.set('order', orderAt(others, index));
}

/** Hides a status and, with it, every card in it. The cards keep their status and come back with `restoreStatus`. */
export function archiveStatus(doc: Y.Doc, statusId: string): void {
  requireStatus(doc, statusId).set('archivedAt', Date.now());
}

export function restoreStatus(doc: Y.Doc, statusId: string): void {
  requireStatus(doc, statusId).set('archivedAt', null);
}

/** Adds a label at the end of the board's labels. The colour used least so far when none is given. */
export function createLabel(doc: Y.Doc, input: { name: string; color?: ColorName }): Label {
  const siblings = readBoard(doc).labels;
  const label: Label = {
    id: newId(),
    name: input.name.trim(),
    color: input.color ?? leastUsedColor(siblings.map((sibling) => sibling.color)),
    order: orderAt(siblings, siblings.length),
  };
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    map.set('name', label.name);
    map.set('color', label.color);
    map.set('order', label.order);
    labelsMap(doc).set(label.id, map);
  });
  return label;
}

export function updateLabel(doc: Y.Doc, labelId: string, changes: { name?: string; color?: ColorName }): void {
  const map = labelsMap(doc).get(labelId);
  if (map === undefined) throw new Error(`No label has the id "${labelId}"`);
  doc.transact(() => {
    if (changes.name !== undefined) map.set('name', changes.name.trim());
    if (changes.color !== undefined) map.set('color', changes.color);
  });
}

/** Removes a label from the board. Cards that carried it keep its id, which readers skip. Deleting a label already gone does nothing. */
export function deleteLabel(doc: Y.Doc, labelId: string): void {
  labelsMap(doc).delete(labelId);
}
