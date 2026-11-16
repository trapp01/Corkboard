/**
 * The workspace doc: the list of boards. A board's name, key, colour and
 * place in the list live here and nowhere else; its statuses, labels and
 * cards live in its own board doc.
 */
import * as Y from 'yjs';
import { colorOr, leastUsedColor, type ColorName } from './colors.js';
import { newId } from './ids.js';
import { orderAt, sortByOrder } from './order.js';

export interface BoardEntry {
  id: string;
  name: string;
  /** The prefix of this board's card refs, e.g. `WEB` in `WEB-12`. Uppercase letters and digits. */
  key: string;
  color: ColorName;
  order: string;
  createdAt: number;
  archivedAt: number | null;
}

export const BOARD_KEY_MAX_LENGTH = 6;

function boardsMap(workspace: Y.Doc): Y.Map<Y.Map<unknown>> {
  return workspace.getMap('boards');
}

function readEntry(id: string, map: Y.Map<unknown>): BoardEntry {
  return {
    id,
    name: String(map.get('name') ?? ''),
    key: String(map.get('key') ?? ''),
    color: colorOr(map.get('color')),
    order: String(map.get('order') ?? ''),
    createdAt: Number(map.get('createdAt') ?? 0),
    archivedAt: (map.get('archivedAt') as number | null | undefined) ?? null,
  };
}

/** Every board in list order. Archived boards are left out unless asked for. */
export function listBoards(workspace: Y.Doc, options: { includeArchived?: boolean } = {}): BoardEntry[] {
  const entries: BoardEntry[] = [];
  boardsMap(workspace).forEach((map, id) => entries.push(readEntry(id, map)));
  return sortByOrder(entries).filter((entry) => options.includeArchived === true || entry.archivedAt === null);
}

export function getBoard(workspace: Y.Doc, boardId: string): BoardEntry | null {
  const map = boardsMap(workspace).get(boardId);
  return map === undefined ? null : readEntry(boardId, map);
}

/** The board with this id, key or name, ignoring case for the key and the name. Archived boards are found too. */
export function findBoard(workspace: Y.Doc, text: string): BoardEntry | null {
  const wanted = text.trim();
  const boards = listBoards(workspace, { includeArchived: true });
  return (
    boards.find((board) => board.id === wanted) ??
    boards.find((board) => board.key === wanted.toUpperCase()) ??
    boards.find((board) => board.name.toLowerCase() === wanted.toLowerCase()) ??
    null
  );
}

/** Uppercase letters and digits only, starting with a letter, at most BOARD_KEY_MAX_LENGTH long; '' when nothing is left. */
export function normalizeBoardKey(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, BOARD_KEY_MAX_LENGTH);
}

/**
 * A key for a board called `name` that no board in `taken` uses: the initials
 * of a name of several words, else its first three letters, with a number
 * added when that is taken.
 */
export function suggestBoardKey(name: string, taken: readonly string[]): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => /[A-Za-z]/.test(word));
  const initials = normalizeBoardKey(words.map((word) => word[0]).join(''));
  const base = (initials.length >= 2 ? initials : normalizeBoardKey(words[0] ?? '').slice(0, 3)) || 'BRD';
  return uniqueKey(base, taken);
}

function uniqueKey(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const key = base.slice(0, BOARD_KEY_MAX_LENGTH - suffix.length) + suffix;
    if (!taken.includes(key)) return key;
  }
}

/**
 * Adds a board at the end of the list. A key that is left out, empty after
 * normalizing, or already taken is replaced by a free one. The caller gives
 * the board its first statuses in the board doc (`createDefaultStatuses`).
 */
export function createBoard(workspace: Y.Doc, input: { name: string; key?: string; color?: ColorName }): BoardEntry {
  const existing = listBoards(workspace, { includeArchived: true });
  const taken = existing.map((board) => board.key);
  const asked = normalizeBoardKey(input.key ?? '');
  const entry: BoardEntry = {
    id: newId(),
    name: input.name.trim() || 'Untitled board',
    key: asked === '' ? suggestBoardKey(input.name, taken) : uniqueKey(asked, taken),
    color: input.color ?? leastUsedColor(existing.map((board) => board.color)),
    order: orderAt(existing, existing.length),
    createdAt: Date.now(),
    archivedAt: null,
  };
  workspace.transact(() => {
    const map = new Y.Map<unknown>();
    map.set('name', entry.name);
    map.set('key', entry.key);
    map.set('color', entry.color);
    map.set('order', entry.order);
    map.set('createdAt', entry.createdAt);
    map.set('archivedAt', null);
    boardsMap(workspace).set(entry.id, map);
  });
  return entry;
}

function requireBoard(workspace: Y.Doc, boardId: string): Y.Map<unknown> {
  const map = boardsMap(workspace).get(boardId);
  if (map === undefined) throw new Error(`No board has the id "${boardId}"`);
  return map;
}

/** Changes a board's name or colour. A person cannot change the key, since card refs written elsewhere contain it. */
export function updateBoard(workspace: Y.Doc, boardId: string, changes: { name?: string; color?: ColorName }): void {
  const map = requireBoard(workspace, boardId);
  workspace.transact(() => {
    if (changes.name !== undefined && changes.name.trim() !== '') map.set('name', changes.name.trim());
    if (changes.color !== undefined) map.set('color', changes.color);
  });
}

/** Moves a board to `index` among the boards that are not archived. */
export function moveBoard(workspace: Y.Doc, boardId: string, index: number): void {
  const map = requireBoard(workspace, boardId);
  const others = listBoards(workspace).filter((board) => board.id !== boardId);
  map.set('order', orderAt(others, index));
}

/** Hides a board. Its doc and cards are kept, and `restoreBoard` brings it back. */
export function archiveBoard(workspace: Y.Doc, boardId: string): void {
  requireBoard(workspace, boardId).set('archivedAt', Date.now());
}

export function restoreBoard(workspace: Y.Doc, boardId: string): void {
  requireBoard(workspace, boardId).set('archivedAt', null);
}

/**
 * Gives every board a key of its own. Two replicas that each created a board
 * while apart can pick the same key; the board created first keeps it and the
 * others get a number added. A key only one board uses is never changed.
 * Returns how many keys changed. Only the server runs this, so two replicas
 * never repair in different directions.
 */
export function dedupeBoardKeys(workspace: Y.Doc): number {
  const boards = listBoards(workspace, { includeArchived: true }).sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
  );
  const taken = new Set<string>();
  const clashing = boards.filter((board) => {
    if (board.key !== '' && !taken.has(board.key)) {
      taken.add(board.key);
      return false;
    }
    return true;
  });
  if (clashing.length === 0) return 0;
  workspace.transact(() => {
    for (const board of clashing) {
      const key = uniqueKey(normalizeBoardKey(board.key) || 'BRD', [...taken]);
      taken.add(key);
      requireBoard(workspace, board.id).set('key', key);
    }
  });
  return clashing.length;
}
