/**
 * Writing cards: creating, editing, moving and archiving them, and the
 * checklist, comments, links and attachments on a card. Every writer takes
 * the board doc and makes its change in one transaction. `by` is the actor
 * recorded in the card's activity.
 */
import * as Y from 'yjs';
import { cardsInStatus, cardsMap, findStatus, readBoard, readCard, type Activity, type Card, type ChecklistItem } from './board.js';
import { newId } from './ids.js';
import { orderAt, sortByOrder } from './order.js';

/** Where a card goes in a status: the top, the bottom, or a position counted from the top. */
export type CardPlace = 'top' | 'bottom' | number;

export interface NewCard {
  title: string;
  /** The board's first status when left out. */
  statusId?: string;
  place?: CardPlace;
  description?: string;
  labelIds?: string[];
  due?: string | null;
  checklist?: string[];
  links?: Array<{ target: string; title: string }>;
  by: string;
}

function requireCard(doc: Y.Doc, cardId: string): Y.Map<unknown> {
  const map = cardsMap(doc).get(cardId);
  if (map === undefined) throw new Error(`No card has the id "${cardId}"`);
  return map;
}

function nested<T>(card: Y.Map<unknown>, field: string): Y.Map<T> {
  let map = card.get(field);
  if (!(map instanceof Y.Map)) {
    map = new Y.Map<T>();
    card.set(field, map);
  }
  return map as Y.Map<T>;
}

function touch(card: Y.Map<unknown>): void {
  card.set('updatedAt', Date.now());
}

function log(card: Y.Map<unknown>, entry: Activity): void {
  let activity = card.get('activity');
  if (!(activity instanceof Y.Array)) {
    activity = new Y.Array<Activity>();
    card.set('activity', activity);
  }
  (activity as Y.Array<Activity>).push([entry]);
}

/** The number a new card on this board takes: one past the highest in use. */
export function nextCardNumber(doc: Y.Doc): number {
  let highest = 0;
  cardsMap(doc).forEach((card) => {
    highest = Math.max(highest, Number(card.get('number') ?? 0));
  });
  return highest + 1;
}

/** The one span that differs between two texts: `from` up to `to` in `before` becomes `insert`. */
function changedSpan(before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before[start] === after[start]) start++;
  let end = 0;
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

/**
 * Makes a Y.Text read `next` by rewriting only the span that differs, so an
 * edit elsewhere in the text made on another replica survives.
 *
 * `base` is the text as the editor of `next` first saw it. When the text has
 * changed since then (someone else added to it while the editor was open),
 * only what the editor changed is applied, at its place in the current text.
 * When both changed the same span, `next` wins for that span.
 */
export function setText(text: Y.Text, next: string, base?: string): void {
  const current = text.toString();
  let change = changedSpan(current, next);
  if (base !== undefined && base !== current) {
    const mine = changedSpan(base, next);
    const theirs = changedSpan(base, current);
    const shift = theirs.insert.length - (theirs.to - theirs.from);
    if (mine.to <= theirs.from) change = mine;
    else if (mine.from >= theirs.to) change = { from: mine.from + shift, to: mine.to + shift, insert: mine.insert };
  }
  if (change.to > change.from) text.delete(change.from, change.to - change.from);
  if (change.insert !== '') text.insert(change.from, change.insert);
}

function placeIndex(place: CardPlace | undefined, count: number): number {
  if (place === undefined || place === 'bottom') return count;
  if (place === 'top') return 0;
  return Math.max(0, Math.min(place, count));
}

/** Adds a card. Throws when the board has no status to put it in. */
export function createCard(doc: Y.Doc, input: NewCard): Card {
  const board = readBoard(doc);
  const status = input.statusId === undefined ? board.statuses[0] : findStatus(board, input.statusId);
  if (status === undefined || status === null) {
    throw new Error(input.statusId === undefined ? 'The board has no statuses to put a card in' : `No status has the id "${input.statusId}"`);
  }
  const siblings = cardsInStatus(board, status.id);
  const id = newId();
  const now = Date.now();
  doc.transact(() => {
    const card = new Y.Map<unknown>();
    cardsMap(doc).set(id, card);
    card.set('number', nextCardNumber(doc));
    card.set('title', input.title.trim() || 'Untitled');
    card.set('status', status.id);
    card.set('order', orderAt(siblings, placeIndex(input.place, siblings.length)));
    const description = new Y.Text();
    card.set('description', description);
    if (input.description) description.insert(0, input.description);
    const labels = new Y.Map<boolean>();
    card.set('labels', labels);
    for (const labelId of input.labelIds ?? []) labels.set(labelId, true);
    card.set('due', input.due ?? null);
    card.set('checklist', new Y.Map());
    card.set('comments', new Y.Map());
    card.set('links', new Y.Map());
    card.set('attachments', new Y.Map());
    card.set('activity', new Y.Array());
    card.set('createdAt', now);
    card.set('createdBy', input.by);
    card.set('updatedAt', now);
    card.set('archivedAt', null);
    log(card, { type: 'created', at: now, by: input.by, status: status.name });
    for (const text of input.checklist ?? []) appendChecklistItem(card, text);
    for (const link of input.links ?? []) nested(card, 'links').set(newId(), { target: link.target, title: link.title, at: now });
  });
  return readCard(id, requireCard(doc, id));
}

/**
 * Changes a card's title, description or due day. A field left out is not
 * touched; `due: null` clears the day. `descriptionBase` is the description
 * as the person editing it first saw it; give it so that text someone else
 * added in the meantime is kept (see `setText`).
 */
export function updateCard(
  doc: Y.Doc,
  cardId: string,
  changes: { title?: string; description?: string; descriptionBase?: string; due?: string | null },
): void {
  const card = requireCard(doc, cardId);
  doc.transact(() => {
    if (changes.title !== undefined && changes.title.trim() !== '') card.set('title', changes.title.trim());
    if (changes.description !== undefined) {
      let text = card.get('description');
      if (!(text instanceof Y.Text)) {
        text = new Y.Text();
        card.set('description', text);
      }
      setText(text as Y.Text, changes.description, changes.descriptionBase);
    }
    if (changes.due !== undefined) card.set('due', changes.due);
    touch(card);
  });
}

/** Puts a label on a card or takes it off. */
export function setCardLabel(doc: Y.Doc, cardId: string, labelId: string, on: boolean): void {
  const card = requireCard(doc, cardId);
  doc.transact(() => {
    const labels = nested<boolean>(card, 'labels');
    if (on) labels.set(labelId, true);
    else labels.delete(labelId);
    touch(card);
  });
}

/**
 * Moves a card to a place in a status, counted among the cards showing there
 * without the card itself. A move to another status is recorded in the
 * card's activity; a reorder inside one status is not.
 */
export function moveCard(doc: Y.Doc, cardId: string, to: { statusId: string; place?: CardPlace }, by: string): void {
  const card = requireCard(doc, cardId);
  const board = readBoard(doc);
  const target = findStatus(board, to.statusId);
  if (target === null) throw new Error(`No status has the id "${to.statusId}"`);
  const siblings = cardsInStatus(board, target.id).filter((sibling) => sibling.id !== cardId);
  const fromId = String(card.get('status') ?? '');
  doc.transact(() => {
    card.set('order', orderAt(siblings, placeIndex(to.place, siblings.length)));
    if (fromId !== target.id) {
      card.set('status', target.id);
      log(card, { type: 'moved', at: Date.now(), by, from: findStatus(board, fromId)?.name ?? '', to: target.name });
    }
    touch(card);
  });
}

/** Hides a card. It stays in the doc and `restoreCard` brings it back. Archiving an archived card does nothing. */
export function archiveCard(doc: Y.Doc, cardId: string, by: string): void {
  const card = requireCard(doc, cardId);
  if (card.get('archivedAt') != null) return;
  doc.transact(() => {
    const now = Date.now();
    card.set('archivedAt', now);
    log(card, { type: 'archived', at: now, by });
    touch(card);
  });
}

export function restoreCard(doc: Y.Doc, cardId: string, by: string): void {
  const card = requireCard(doc, cardId);
  if (card.get('archivedAt') == null) return;
  doc.transact(() => {
    card.set('archivedAt', null);
    log(card, { type: 'restored', at: Date.now(), by });
    touch(card);
  });
}

function checklistItems(card: Y.Map<unknown>): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  nested<Y.Map<unknown>>(card, 'checklist').forEach((item, id) => {
    items.push({ id, text: String(item.get('text') ?? ''), done: item.get('done') === true, order: String(item.get('order') ?? '') });
  });
  return sortByOrder(items);
}

function appendChecklistItem(card: Y.Map<unknown>, text: string): string {
  const siblings = checklistItems(card);
  const id = newId();
  const item = new Y.Map<unknown>();
  nested<Y.Map<unknown>>(card, 'checklist').set(id, item);
  item.set('text', text.trim());
  item.set('done', false);
  item.set('order', orderAt(siblings, siblings.length));
  return id;
}

/** Adds an item at the end of the card's checklist and returns its id. */
export function addChecklistItem(doc: Y.Doc, cardId: string, text: string): string {
  const card = requireCard(doc, cardId);
  let id = '';
  doc.transact(() => {
    id = appendChecklistItem(card, text);
    touch(card);
  });
  return id;
}

function requireChecklistItem(card: Y.Map<unknown>, itemId: string): Y.Map<unknown> {
  const item = nested<Y.Map<unknown>>(card, 'checklist').get(itemId);
  if (item === undefined) throw new Error(`The card has no checklist item with the id "${itemId}"`);
  return item;
}

export function updateChecklistItem(doc: Y.Doc, cardId: string, itemId: string, changes: { text?: string; done?: boolean }): void {
  const card = requireCard(doc, cardId);
  const item = requireChecklistItem(card, itemId);
  doc.transact(() => {
    if (changes.text !== undefined) item.set('text', changes.text.trim());
    if (changes.done !== undefined) item.set('done', changes.done);
    touch(card);
  });
}

/** Moves a checklist item to `index` among the card's other items. */
export function moveChecklistItem(doc: Y.Doc, cardId: string, itemId: string, index: number): void {
  const card = requireCard(doc, cardId);
  const item = requireChecklistItem(card, itemId);
  item.set('order', orderAt(checklistItems(card).filter((other) => other.id !== itemId), index));
}

export function removeChecklistItem(doc: Y.Doc, cardId: string, itemId: string): void {
  const card = requireCard(doc, cardId);
  doc.transact(() => {
    nested(card, 'checklist').delete(itemId);
    touch(card);
  });
}

/** Adds a comment and returns its id. */
export function addComment(doc: Y.Doc, cardId: string, body: string, by: string): string {
  const card = requireCard(doc, cardId);
  const id = newId();
  doc.transact(() => {
    nested(card, 'comments').set(id, { body, by, at: Date.now(), editedAt: null });
    touch(card);
  });
  return id;
}

export function editComment(doc: Y.Doc, cardId: string, commentId: string, body: string): void {
  const card = requireCard(doc, cardId);
  const comments = nested<{ body: string; by: string; at: number; editedAt: number | null }>(card, 'comments');
  const comment = comments.get(commentId);
  if (comment === undefined) throw new Error(`The card has no comment with the id "${commentId}"`);
  comments.set(commentId, { ...comment, body, editedAt: Date.now() });
}

export function deleteComment(doc: Y.Doc, cardId: string, commentId: string): void {
  nested(requireCard(doc, cardId), 'comments').delete(commentId);
}

/** Adds a link and returns its id. A card that already links to the target keeps its one link, with the new title. */
export function addLink(doc: Y.Doc, cardId: string, link: { target: string; title: string }): string {
  const card = requireCard(doc, cardId);
  const links = nested<{ target: string; title: string; at: number }>(card, 'links');
  let id = newId();
  let at = Date.now();
  links.forEach((existing, existingId) => {
    if (existing.target !== link.target) return;
    id = existingId;
    at = existing.at;
  });
  doc.transact(() => {
    links.set(id, { target: link.target, title: link.title, at });
    touch(card);
  });
  return id;
}

export function removeLink(doc: Y.Doc, cardId: string, linkId: string): void {
  nested(requireCard(doc, cardId), 'links').delete(linkId);
}

/** Records a blob the replica already stores as an attachment of the card, and returns the attachment's id. */
export function addAttachment(doc: Y.Doc, cardId: string, file: { blob: string; name: string; mime: string; size: number }): string {
  const card = requireCard(doc, cardId);
  const id = newId();
  doc.transact(() => {
    nested(card, 'attachments').set(id, { ...file, at: Date.now() });
    touch(card);
  });
  return id;
}

export function removeAttachment(doc: Y.Doc, cardId: string, attachmentId: string): void {
  nested(requireCard(doc, cardId), 'attachments').delete(attachmentId);
}

/**
 * Gives every card on the board a number of its own. Two replicas that each
 * added a card while apart both take the next number; the card created first
 * keeps it and the others take the numbers after the highest. Returns how
 * many numbers changed. Only the server runs this, so two replicas never
 * renumber in different directions.
 */
export function renumberDuplicateCards(doc: Y.Doc): number {
  const cards: Array<{ id: string; number: number; createdAt: number }> = [];
  cardsMap(doc).forEach((card, id) => {
    cards.push({ id, number: Number(card.get('number') ?? 0), createdAt: Number(card.get('createdAt') ?? 0) });
  });
  cards.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const seen = new Set<number>();
  const clashing = cards.filter((card) => {
    if (card.number >= 1 && !seen.has(card.number)) {
      seen.add(card.number);
      return false;
    }
    return true;
  });
  if (clashing.length === 0) return 0;
  let next = Math.max(0, ...seen) + 1;
  doc.transact(() => {
    for (const card of clashing) requireCard(doc, card.id).set('number', next++);
  });
  return clashing.length;
}
