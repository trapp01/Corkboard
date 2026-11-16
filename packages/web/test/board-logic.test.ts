import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addComment, cardsInStatus, createCard, createDefaultStatuses, createLabel, moveCard, readBoard, setCardLabel, updateCard } from '@corkboard/model';
import { dragOver, dropPlace, placeCard, samePlace, type Columns } from '../src/board/drag-model.js';
import { liveFilter, matchingCardIds } from '../src/board/filter.js';
import { changedCardIds } from '../src/board/live-changes.js';

const columns: Columns = { todo: ['a', 'b', 'c'], doing: ['d'], done: [] };

describe('drag model', () => {
  it('reorders inside a status the way a sortable list does', () => {
    expect(dragOver(columns, 'a', { kind: 'card', cardId: 'c', below: false }).todo).toEqual(['b', 'c', 'a']);
    expect(dragOver(columns, 'c', { kind: 'card', cardId: 'a', below: true }).todo).toEqual(['c', 'a', 'b']);
    expect(dragOver(columns, 'a', { kind: 'card', cardId: 'b', below: false }).todo).toEqual(['b', 'a', 'c']);
  });

  it('crosses to another status before or after the card under the pointer', () => {
    const above = dragOver(columns, 'b', { kind: 'card', cardId: 'd', below: false });
    expect(above).toEqual({ todo: ['a', 'c'], doing: ['b', 'd'], done: [] });
    const below = dragOver(columns, 'b', { kind: 'card', cardId: 'd', below: true });
    expect(below.doing).toEqual(['d', 'b']);
  });

  it('drops into an empty status at the bottom, and stays put over its own status', () => {
    expect(dragOver(columns, 'a', { kind: 'status', statusId: 'done' }).done).toEqual(['a']);
    expect(dragOver(columns, 'a', { kind: 'status', statusId: 'todo' })).toBe(columns);
  });

  it('returns the same columns when the card is already there', () => {
    expect(placeCard(columns, 'b', 'todo', 1)).toBe(columns);
    expect(dragOver(columns, 'b', { kind: 'card', cardId: 'b', below: true })).toBe(columns);
  });

  it('reads the drop place as an index among the other cards', () => {
    const moved = dragOver(columns, 'a', { kind: 'card', cardId: 'd', below: true });
    expect(dropPlace(moved, 'a')).toEqual({ statusId: 'doing', index: 1 });
    expect(samePlace(columns, moved, 'a')).toBe(false);
    expect(samePlace(columns, columns, 'a')).toBe(true);
    expect(dropPlace(columns, 'missing')).toBeNull();
  });

  it('lands where the model puts it', () => {
    const doc = new Y.Doc();
    createDefaultStatuses(doc);
    const [backlog, thisWeek] = readBoard(doc).statuses;
    const ids = ['one', 'two', 'three'].map((title) => createCard(doc, { title, statusId: backlog!.id, by: 'test' }).id);
    const other = createCard(doc, { title: 'other', statusId: thisWeek!.id, by: 'test' }).id;
    const start: Columns = { [backlog!.id]: ids, [thisWeek!.id]: [other] };
    const after = dragOver(start, ids[0]!, { kind: 'card', cardId: other, below: true });
    const place = dropPlace(after, ids[0]!)!;
    moveCard(doc, ids[0]!, { statusId: place.statusId, place: place.index }, 'test');
    const board = readBoard(doc);
    expect(cardsInStatus(board, thisWeek!.id).map((card) => card.title)).toEqual(['other', 'one']);
    const within = dragOver({ [backlog!.id]: [ids[1]!, ids[2]!] }, ids[2]!, { kind: 'card', cardId: ids[1]!, below: false });
    const top = dropPlace(within, ids[2]!)!;
    moveCard(doc, ids[2]!, { statusId: top.statusId, place: top.index }, 'test');
    expect(cardsInStatus(readBoard(doc), backlog!.id).map((card) => card.title)).toEqual(['three', 'two']);
  });
});

describe('filter', () => {
  function board() {
    const doc = new Y.Doc();
    createDefaultStatuses(doc);
    const ios = createLabel(doc, { name: 'iOS' });
    const web = createLabel(doc, { name: 'Web' });
    const login = createCard(doc, { title: 'Fix login timeout', by: 'test' });
    const search = createCard(doc, { title: 'Search results page', by: 'test' });
    const plain = createCard(doc, { title: 'Write release notes', by: 'test' });
    setCardLabel(doc, login.id, ios.id, true);
    setCardLabel(doc, search.id, web.id, true);
    return { doc, ios, web, login, search, plain };
  }

  it('shows every card when nothing is filtered', () => {
    const { doc } = board();
    expect(matchingCardIds(readBoard(doc), { query: '  ', labelIds: [] })).toBeNull();
  });

  it('matches words and any selected label together', () => {
    const { doc, ios, web, login, search } = board();
    const snapshot = readBoard(doc);
    expect(matchingCardIds(snapshot, { query: 'login', labelIds: [] })).toEqual(new Set([login.id]));
    expect(matchingCardIds(snapshot, { query: '', labelIds: [ios.id, web.id] })).toEqual(new Set([login.id, search.id]));
    expect(matchingCardIds(snapshot, { query: 'search', labelIds: [ios.id] })).toEqual(new Set());
  });

  it('drops labels that were deleted', () => {
    const { doc, ios } = board();
    const filter = { query: '', labelIds: [ios.id, 'gone'] };
    expect(liveFilter(readBoard(doc), filter).labelIds).toEqual([ios.id]);
    const kept = { query: '', labelIds: [ios.id] };
    expect(liveFilter(readBoard(doc), kept)).toBe(kept);
  });
});

describe('changedCardIds', () => {
  it('names new and changed cards only', () => {
    const doc = new Y.Doc();
    createDefaultStatuses(doc);
    const a = createCard(doc, { title: 'A', by: 'test' });
    const b = createCard(doc, { title: 'B', by: 'test' });
    const before = readBoard(doc);
    updateCard(doc, a.id, { title: 'A, renamed' });
    const c = createCard(doc, { title: 'C', by: 'agent' });
    addComment(doc, a.id, 'Looked into it', 'agent');
    const changed = changedCardIds(before, readBoard(doc));
    expect(changed.sort()).toEqual([a.id, c.id].sort());
    expect(changed).not.toContain(b.id);
  });
});
