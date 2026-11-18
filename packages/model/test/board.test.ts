import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addChecklistItem,
  addComment,
  addLink,
  archiveCard,
  archiveStatus,
  archivedCards,
  cardsInStatus,
  createBoard,
  createCard,
  createDefaultStatuses,
  createLabel,
  createStatus,
  dedupeBoardKeys,
  deleteLabel,
  findBoard,
  formatCardRef,
  listBoards,
  looseleafAppAddress,
  looseleafTarget,
  looseleafWebAddress,
  moveCard,
  moveStatus,
  parseCardRef,
  parseLinkTarget,
  readBoard,
  renderBoard,
  renderCard,
  restoreCard,
  searchCards,
  setCardLabel,
  setText,
  suggestBoardKey,
  updateCard,
  updateChecklistItem,
} from '../src/index.js';

function newBoard(): Y.Doc {
  const doc = new Y.Doc();
  createDefaultStatuses(doc);
  return doc;
}

function titles(doc: Y.Doc, statusName: string): string[] {
  const board = readBoard(doc);
  const status = board.statuses.find((candidate) => candidate.name === statusName)!;
  return cardsInStatus(board, status.id).map((card) => card.title);
}

function statusId(doc: Y.Doc, name: string): string {
  return readBoard(doc).statuses.find((status) => status.name === name)!.id;
}

describe('workspace', () => {
  it('gives each board a key of its own', () => {
    const workspace = new Y.Doc();
    const first = createBoard(workspace, { name: 'Web App' });
    const second = createBoard(workspace, { name: 'Warehouse Admin' });
    const third = createBoard(workspace, { name: 'Tasks', key: 'wa' });
    expect([first.key, second.key, third.key]).toEqual(['WA', 'WA2', 'WA3']);
    expect(listBoards(workspace).map((board) => board.name)).toEqual(['Web App', 'Warehouse Admin', 'Tasks']);
  });

  it('suggests initials for several words and the first letters for one', () => {
    expect(suggestBoardKey('Driver app iOS', [])).toBe('DAI');
    expect(suggestBoardKey('Deeleeo', [])).toBe('DEE');
    expect(suggestBoardKey('123', [])).toBe('BRD');
  });

  it('finds a board by id, key or name', () => {
    const workspace = new Y.Doc();
    const board = createBoard(workspace, { name: 'Main board', key: 'MAIN' });
    expect(findBoard(workspace, board.id)?.id).toBe(board.id);
    expect(findBoard(workspace, 'main')?.id).toBe(board.id);
    expect(findBoard(workspace, 'main BOARD')?.id).toBe(board.id);
    expect(findBoard(workspace, 'other')).toBeNull();
  });

  it('repairs two boards that took the same key while apart, oldest keeps it', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const first = createBoard(a, { name: 'Web' });
    const second = createBoard(b, { name: 'Web' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(dedupeBoardKeys(a)).toBe(1);
    const keys = listBoards(a).map((board) => board.key).sort();
    expect(keys).toEqual(['WEB', 'WEB2']);
    const older = first.createdAt < second.createdAt || (first.createdAt === second.createdAt && first.id < second.id) ? first : second;
    expect(findBoard(a, older.id)?.key).toBe('WEB');
    expect(dedupeBoardKeys(a)).toBe(0);
  });

  it('leaves a key alone when only one board uses it, whatever a repair elsewhere needs', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    createBoard(a, { name: 'Web' });
    createBoard(b, { name: 'Web' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    const typed = createBoard(a, { name: 'Web two', key: 'WEB2' });
    expect(typed.key).toBe('WEB2');
    expect(dedupeBoardKeys(a)).toBe(1);
    expect(findBoard(a, typed.id)?.key).toBe('WEB2');
    expect(listBoards(a).map((board) => board.key).sort()).toEqual(['WEB', 'WEB2', 'WEB3']);
  });
});

describe('cards', () => {
  it('numbers cards from 1 and places them at the top unless given the bottom or a position', () => {
    const doc = newBoard();
    const by = 'Sam';
    const a = createCard(doc, { title: 'A', by });
    const b = createCard(doc, { title: 'B', by });
    createCard(doc, { title: 'C', place: 'bottom', by });
    createCard(doc, { title: 'D', place: 1, by });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(titles(doc, 'Backlog')).toEqual(['B', 'D', 'A', 'C']);
  });

  it('moves a card between statuses and records the move, but not a reorder', () => {
    const doc = newBoard();
    const a = createCard(doc, { title: 'A', by: 'Sam' });
    createCard(doc, { title: 'B', by: 'Sam' });
    moveCard(doc, a.id, { statusId: statusId(doc, 'Backlog'), place: 'bottom' }, 'Sam');
    expect(titles(doc, 'Backlog')).toEqual(['B', 'A']);
    moveCard(doc, a.id, { statusId: statusId(doc, 'In progress') }, 'Agent');
    expect(titles(doc, 'In progress')).toEqual(['A']);
    const card = readBoard(doc).cards.find((candidate) => candidate.id === a.id)!;
    expect(card.activity.map((entry) => entry.type)).toEqual(['created', 'moved']);
    expect(card.activity[1]).toMatchObject({ by: 'Agent', from: 'Backlog', to: 'In progress' });
  });

  it('archives and restores a card, and hides the cards of an archived status', () => {
    const doc = newBoard();
    const a = createCard(doc, { title: 'A', by: 'Sam' });
    const b = createCard(doc, { title: 'B', by: 'Sam' });
    archiveCard(doc, a.id, 'Sam');
    expect(titles(doc, 'Backlog')).toEqual(['B']);
    restoreCard(doc, a.id, 'Sam');
    expect(titles(doc, 'Backlog')).toEqual(['B', 'A']);
    archiveStatus(doc, statusId(doc, 'Backlog'));
    const board = readBoard(doc);
    expect(board.statuses.map((status) => status.name)).not.toContain('Backlog');
    expect(archivedCards(board).map((card) => card.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('keeps labels, checklist, comments and links on a card', () => {
    const doc = newBoard();
    const ios = createLabel(doc, { name: 'iOS driver' });
    const web = createLabel(doc, { name: 'Web app' });
    const card = createCard(doc, { title: 'Sign-in loop', labelIds: [ios.id], checklist: ['Reproduce'], by: 'Sam' });
    setCardLabel(doc, card.id, web.id, true);
    const item = addChecklistItem(doc, card.id, 'Fix');
    updateChecklistItem(doc, card.id, item, { done: true });
    addComment(doc, card.id, 'Found the cause', 'Agent');
    addLink(doc, card.id, { target: looseleafTarget('abc123'), title: 'Scope notes' });
    addLink(doc, card.id, { target: looseleafTarget('abc123'), title: 'Scope' });
    deleteLabel(doc, ios.id);
    const read = readBoard(doc).cards[0]!;
    expect(read.checklist.map((entry) => [entry.text, entry.done])).toEqual([
      ['Reproduce', false],
      ['Fix', true],
    ]);
    expect(read.comments.map((comment) => comment.by)).toEqual(['Agent']);
    expect(read.links.map((link) => link.title)).toEqual(['Scope']);
    const board = readBoard(doc);
    expect(board.labels.map((label) => label.name)).toEqual(['Web app']);
  });

  it('moves a status among the others', () => {
    const doc = newBoard();
    const review = createStatus(doc, { name: 'In review', kind: 'doing' });
    moveStatus(doc, review.id, 3);
    expect(readBoard(doc).statuses.map((status) => status.name)).toEqual(['Backlog', 'This week', 'In progress', 'In review', 'Blocked', 'Done']);
  });
});

describe('two replicas', () => {
  function sync(a: Y.Doc, b: Y.Doc): void {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  }

  it('keep both edits to one description', () => {
    const a = newBoard();
    const card = createCard(a, { title: 'A', description: 'first line\nlast line', by: 'Sam' });
    const b = new Y.Doc();
    sync(a, b);
    updateCard(a, card.id, { description: 'FIRST line\nlast line' });
    updateCard(b, card.id, { description: 'first line\nlast line, and more' });
    sync(a, b);
    expect(readBoard(a).cards[0]!.description).toBe('FIRST line\nlast line, and more');
    expect(Y.encodeStateAsUpdate(a)).toEqual(Y.encodeStateAsUpdate(b));
  });

  it('keep text added to a description while someone had it open to edit', () => {
    const doc = newBoard();
    const card = createCard(doc, { title: 'A', description: 'first line\nlast line', by: 'Sam' });
    const opened = readBoard(doc).cards[0]!.description;
    updateCard(doc, card.id, { description: `${opened}\n\nAdded by the agent.` });
    updateCard(doc, card.id, { description: 'FIRST line\nlast line', descriptionBase: opened });
    expect(readBoard(doc).cards[0]!.description).toBe('FIRST line\nlast line\n\nAdded by the agent.');

    updateCard(doc, card.id, { description: 'intro\nFIRST line\nlast line\n\nAdded by the agent.' });
    const reopened = 'intro\nFIRST line\nlast line\n\nAdded by the agent.';
    updateCard(doc, card.id, { description: 'An intro\nFIRST line\nlast line\n\nAdded by the agent.' });
    updateCard(doc, card.id, { description: `${reopened} And more.`, descriptionBase: reopened });
    expect(readBoard(doc).cards[0]!.description).toBe('An intro\nFIRST line\nlast line\n\nAdded by the agent. And more.');

    const same = readBoard(doc).cards[0]!.description;
    updateCard(doc, card.id, { description: 'theirs' });
    updateCard(doc, card.id, { description: 'mine', descriptionBase: same });
    expect(readBoard(doc).cards[0]!.description).toBe('mine');
  });

  it('keep both cards when each adds one while apart, and the server renumbers the later one', async () => {
    const a = newBoard();
    createCard(a, { title: 'Shared', by: 'Sam' });
    const b = new Y.Doc();
    sync(a, b);
    const onA = createCard(a, { title: 'From A', by: 'Sam' });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const onB = createCard(b, { title: 'From B', by: 'Agent' });
    expect(onA.number).toBe(onB.number);
    sync(a, b);
    const { renumberDuplicateCards } = await import('../src/index.js');
    expect(renumberDuplicateCards(a)).toBe(1);
    sync(a, b);
    const numbers = Object.fromEntries(readBoard(b).cards.map((card) => [card.title, card.number]));
    expect(numbers).toEqual({ Shared: 1, 'From A': 2, 'From B': 3 });
    expect(renumberDuplicateCards(b)).toBe(0);
    expect(Y.encodeStateAsUpdate(a)).toEqual(Y.encodeStateAsUpdate(b));
  });

  it('keep a card that one moved and the other commented on', () => {
    const a = newBoard();
    const card = createCard(a, { title: 'A', by: 'Sam' });
    const b = new Y.Doc();
    sync(a, b);
    moveCard(a, card.id, { statusId: statusId(a, 'Done') }, 'Sam');
    addComment(b, card.id, 'Still looking', 'Agent');
    sync(a, b);
    const read = readBoard(b).cards[0]!;
    expect(read.statusId).toBe(statusId(b, 'Done'));
    expect(read.comments).toHaveLength(1);
    expect(read.activity.map((entry) => entry.type)).toEqual(['created', 'moved']);
  });
});

describe('text forms', () => {
  it('rewrites only the span of a text that differs', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'hello world');
    let deleted = 0;
    text.observe((event) => {
      for (const part of event.changes.delta) deleted += 'delete' in part ? (part.delete ?? 0) : 0;
    });
    setText(text, 'hello brave world');
    expect(text.toString()).toBe('hello brave world');
    expect(deleted).toBe(0);
    setText(text, '');
    expect(text.toString()).toBe('');
  });

  it('reads card refs and link targets', () => {
    expect(formatCardRef('WEB', 12)).toBe('WEB-12');
    expect(parseCardRef('web-12')).toEqual({ key: 'WEB', number: 12 });
    expect(parseCardRef('http://127.0.0.1:8422/c/WEB-12')).toEqual({ key: 'WEB', number: 12 });
    expect(parseCardRef('#A2-7')).toEqual({ key: 'A2', number: 7 });
    expect(parseCardRef('twelve')).toBeNull();
    expect(parseCardRef('IFCI4HLFG2UG0PZLU6V-9')).toBeNull();
    expect(parseLinkTarget('looseleaf:GjCU_n-8w')).toEqual({ kind: 'looseleaf', pageId: 'GjCU_n-8w' });
    expect(parseLinkTarget('https://example.com/pr/4')).toEqual({ kind: 'url', url: 'https://example.com/pr/4' });
    expect(parseLinkTarget('javascript:alert(1)')).toBeNull();
  });

  it('builds the two addresses Looseleaf opens a page at', () => {
    expect(looseleafWebAddress('http://nas:8421', 'GjCU_n-8w')).toBe('http://nas:8421/#page=GjCU_n-8w');
    expect(looseleafWebAddress('http://nas:8421//', 'GjCU_n-8w')).toBe('http://nas:8421/#page=GjCU_n-8w');
    expect(looseleafAppAddress('GjCU_n-8w')).toBe('looseleaf://page/GjCU_n-8w');
  });
});

describe('search and rendering', () => {
  function sample() {
    const workspace = new Y.Doc();
    const entry = createBoard(workspace, { name: 'Main board', key: 'MAIN' });
    const doc = newBoard();
    const ios = createLabel(doc, { name: 'iOS driver' });
    const login = createCard(doc, { title: 'Login loop on iOS', description: 'Token refresh fails', labelIds: [ios.id], due: '2030-01-05', checklist: ['Reproduce'], by: 'Sam' });
    const other = createCard(doc, { title: 'Export earnings', description: 'Mention the login page', by: 'Sam' });
    addComment(doc, login.id, 'Reproduced on a test phone', 'Agent');
    addLink(doc, login.id, { target: looseleafTarget('pg1'), title: 'Scope notes' });
    return { entry, doc, ios, login, other };
  }

  it('finds cards by every word, title matches first, and filters by label and due day', () => {
    const { doc, ios, login, other } = sample();
    const board = readBoard(doc);
    expect(searchCards(board, { query: 'login' }).map((card) => card.id)).toEqual([login.id, other.id]);
    expect(searchCards(board, { query: 'login token' }).map((card) => card.id)).toEqual([login.id]);
    expect(searchCards(board, { query: 'test phone' }).map((card) => card.id)).toEqual([login.id]);
    expect(searchCards(board, { labelId: ios.id }).map((card) => card.id)).toEqual([login.id]);
    expect(searchCards(board, { dueBy: '2030-01-04' })).toEqual([]);
    archiveCard(doc, login.id, 'Sam');
    expect(searchCards(readBoard(doc), { query: 'token' })).toEqual([]);
    expect(searchCards(readBoard(doc), { query: 'token', includeArchived: true })).toHaveLength(1);
  });

  it('renders the board at a glance', () => {
    const { entry, doc } = sample();
    const text = renderBoard(entry, readBoard(doc), { baseUrl: 'http://board' });
    expect(text).toContain('# Main board (MAIN)');
    expect(text).toContain('## Backlog (todo, 2 cards)');
    expect(text).toContain('- MAIN-1 Login loop on iOS · [iOS driver] · due 2030-01-05 · checklist 0/1 · 1 comment');
    expect(text).toContain('## Done (done, 0 cards)');
    expect(renderBoard(entry, readBoard(doc), { cardsPerStatus: 1 })).toContain('- … and 1 more');
  });

  it('renders everything on a card, with the text of a linked page', () => {
    const { entry, doc, login } = sample();
    const board = readBoard(doc);
    const card = board.cards.find((candidate) => candidate.id === login.id)!;
    const text = renderCard(entry, board, card, { baseUrl: 'http://board', linkedText: new Map([[looseleafTarget('pg1'), 'Out of scope: Android']]) });
    expect(text).toContain('# MAIN-1 Login loop on iOS');
    expect(text).toContain('- Status: Backlog (todo)');
    expect(text).toContain('- Position: 2 of 2 in Backlog');
    expect(text).toContain('- Address: http://board/c/MAIN-1');
    expect(text).toContain('Token refresh fails');
    expect(text).toContain(`- [ ] Reproduce (item ${card.checklist[0]!.id})`);
    expect(text).toContain('- Scope notes — Looseleaf page pg1');
    expect(text).toContain('  > Out of scope: Android');
    expect(text).toContain('### Agent, ');
    expect(text).toContain('Sam created this card in Backlog');
  });
});
