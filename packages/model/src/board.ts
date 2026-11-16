/**
 * A board doc read as plain objects. `readBoard` is the one reader: the web
 * client, the search and the Markdown renderers all work from its result and
 * never touch the Yjs types. The writers are in statuses.ts (statuses and
 * labels) and cards.ts (cards and everything on a card).
 */
import * as Y from 'yjs';
import { colorOr, type ColorName } from './colors.js';
import { sortByOrder } from './order.js';

/**
 * What a status means for the work on its cards, whatever the status is
 * called: not started, being worked on, or finished.
 */
export type StatusKind = 'todo' | 'doing' | 'done';

export const STATUS_KINDS: readonly StatusKind[] = ['todo', 'doing', 'done'];

export interface Status {
  id: string;
  name: string;
  kind: StatusKind;
  order: string;
  archivedAt: number | null;
}

export interface Label {
  id: string;
  name: string;
  color: ColorName;
  order: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: string;
}

export interface Comment {
  id: string;
  /** Markdown. */
  body: string;
  /** The actor who wrote it. */
  by: string;
  at: number;
  editedAt: number | null;
}

export interface CardLink {
  id: string;
  /** A URL, or `looseleaf:<pageId>` for a Looseleaf page; see refs.ts. */
  target: string;
  title: string;
  at: number;
}

export interface Attachment {
  id: string;
  /** SHA-256 hex of the blob. */
  blob: string;
  name: string;
  mime: string;
  size: number;
  at: number;
}

/** One entry in a card's history. Status names are copied in, so the entry still reads after a rename. */
export type Activity =
  | { type: 'created'; at: number; by: string; status: string }
  | { type: 'moved'; at: number; by: string; from: string; to: string }
  | { type: 'archived'; at: number; by: string }
  | { type: 'restored'; at: number; by: string };

export interface Card {
  id: string;
  /** The number in the card's ref. Unique on its board once the server has seen the card. */
  number: number;
  title: string;
  statusId: string;
  order: string;
  /** Markdown. */
  description: string;
  labelIds: string[];
  /** A calendar day, `YYYY-MM-DD`, or null. */
  due: string | null;
  checklist: ChecklistItem[];
  comments: Comment[];
  links: CardLink[];
  attachments: Attachment[];
  activity: Activity[];
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  archivedAt: number | null;
}

export interface BoardSnapshot {
  /** Statuses that are not archived, in board order. */
  statuses: Status[];
  archivedStatuses: Status[];
  /** In label order. */
  labels: Label[];
  /** Every card, archived ones included, in no particular order. */
  cards: Card[];
}

export function statusesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap('statuses');
}

export function labelsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap('labels');
}

export function cardsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap('cards');
}

function readStatus(id: string, map: Y.Map<unknown>): Status {
  const kind = map.get('kind');
  return {
    id,
    name: String(map.get('name') ?? ''),
    kind: STATUS_KINDS.includes(kind as StatusKind) ? (kind as StatusKind) : 'todo',
    order: String(map.get('order') ?? ''),
    archivedAt: (map.get('archivedAt') as number | null | undefined) ?? null,
  };
}

function readLabel(id: string, map: Y.Map<unknown>): Label {
  return {
    id,
    name: String(map.get('name') ?? ''),
    color: colorOr(map.get('color')),
    order: String(map.get('order') ?? ''),
  };
}

/** The entries of a card's nested map as plain objects carrying their id, oldest first. */
function readEntries<T extends { id: string; at: number }>(card: Y.Map<unknown>, field: string): T[] {
  const map = card.get(field);
  if (!(map instanceof Y.Map)) return [];
  const entries: T[] = [];
  map.forEach((value, id) => {
    if (typeof value === 'object' && value !== null) entries.push({ ...(value as object), id } as T);
  });
  return entries.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

function readChecklist(card: Y.Map<unknown>): ChecklistItem[] {
  const map = card.get('checklist');
  if (!(map instanceof Y.Map)) return [];
  const items: ChecklistItem[] = [];
  map.forEach((value, id) => {
    if (!(value instanceof Y.Map)) return;
    items.push({ id, text: String(value.get('text') ?? ''), done: value.get('done') === true, order: String(value.get('order') ?? '') });
  });
  return sortByOrder(items);
}

export function readCard(id: string, map: Y.Map<unknown>): Card {
  const description = map.get('description');
  const labels = map.get('labels');
  const activity = map.get('activity');
  return {
    id,
    number: Number(map.get('number') ?? 0),
    title: String(map.get('title') ?? ''),
    statusId: String(map.get('status') ?? ''),
    order: String(map.get('order') ?? ''),
    description: description instanceof Y.Text ? description.toString() : '',
    labelIds: labels instanceof Y.Map ? [...labels.keys()] : [],
    due: (map.get('due') as string | null | undefined) ?? null,
    checklist: readChecklist(map),
    comments: readEntries<Comment>(map, 'comments'),
    links: readEntries<CardLink>(map, 'links'),
    attachments: readEntries<Attachment>(map, 'attachments'),
    activity: activity instanceof Y.Array ? (activity.toArray() as Activity[]) : [],
    createdAt: Number(map.get('createdAt') ?? 0),
    createdBy: String(map.get('createdBy') ?? ''),
    updatedAt: Number(map.get('updatedAt') ?? 0),
    archivedAt: (map.get('archivedAt') as number | null | undefined) ?? null,
  };
}

/** The whole board as plain objects. */
export function readBoard(doc: Y.Doc): BoardSnapshot {
  const statuses: Status[] = [];
  statusesMap(doc).forEach((map, id) => statuses.push(readStatus(id, map)));
  const labels: Label[] = [];
  labelsMap(doc).forEach((map, id) => labels.push(readLabel(id, map)));
  const cards: Card[] = [];
  cardsMap(doc).forEach((map, id) => cards.push(readCard(id, map)));
  const sorted = sortByOrder(statuses);
  return {
    statuses: sorted.filter((status) => status.archivedAt === null),
    archivedStatuses: sorted.filter((status) => status.archivedAt !== null),
    labels: sortByOrder(labels),
    cards,
  };
}

/**
 * The status a card shows under: its own, or the board's first status when
 * its own was never synced to this replica. Null when the card's status is
 * archived (the card is hidden with it) or the board has no statuses.
 */
export function shownStatusId(board: BoardSnapshot, card: Card): string | null {
  if (board.statuses.some((status) => status.id === card.statusId)) return card.statusId;
  if (board.archivedStatuses.some((status) => status.id === card.statusId)) return null;
  return board.statuses[0]?.id ?? null;
}

/** The cards showing in a status, top first. Archived cards are left out. */
export function cardsInStatus(board: BoardSnapshot, statusId: string): Card[] {
  return sortByOrder(board.cards.filter((card) => card.archivedAt === null && shownStatusId(board, card) === statusId));
}

/** Every card showing on the board: not archived, and not in an archived status. */
export function shownCards(board: BoardSnapshot): Card[] {
  return board.cards.filter((card) => card.archivedAt === null && shownStatusId(board, card) !== null);
}

/** Cards that are archived themselves or sit in an archived status, most recently archived first. */
export function archivedCards(board: BoardSnapshot): Card[] {
  return board.cards
    .filter((card) => card.archivedAt !== null || shownStatusId(board, card) === null)
    .sort((a, b) => (b.archivedAt ?? b.updatedAt) - (a.archivedAt ?? a.updatedAt));
}

export function findStatus(board: BoardSnapshot, statusId: string): Status | null {
  return [...board.statuses, ...board.archivedStatuses].find((status) => status.id === statusId) ?? null;
}

/** A card's labels in label order, skipping ids whose label was deleted. */
export function cardLabels(board: BoardSnapshot, card: Card): Label[] {
  return board.labels.filter((label) => card.labelIds.includes(label.id));
}

/** How many checklist items are done, and how many there are. */
export function checklistProgress(card: Card): { done: number; total: number } {
  return { done: card.checklist.filter((item) => item.done).length, total: card.checklist.length };
}
