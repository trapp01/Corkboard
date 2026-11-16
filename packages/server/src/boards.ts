/**
 * The server's own view of the boards, for the MCP tools: finding a board or
 * a card from what a caller typed, reading one, and changing one. This is
 * the one server file that knows what is inside a doc, and it knows it only
 * through `model`. Every change goes through the hub, so it is stored and
 * reaches every connected client like an edit made in the web client.
 */
import type * as Y from 'yjs';
import {
  WORKSPACE_DOC_ID,
  boardDocId,
  boardIdOfDoc,
  createBoard,
  createDefaultStatuses,
  dedupeBoardKeys,
  findBoard,
  formatCardRef,
  listBoards,
  parseCardRef,
  readBoard,
  renumberDuplicateCards,
  type BoardEntry,
  type BoardSnapshot,
  type Card,
  type Label,
  type Status,
} from '@corkboard/model';
import type { Hub } from './hub.js';

/** A request the caller can fix: an unknown board, card, status or label, or a value that makes no sense. */
export class NotFoundError extends Error {}

export interface OpenBoard {
  entry: BoardEntry;
  board: BoardSnapshot;
}

export interface OpenCard extends OpenBoard {
  card: Card;
  ref: string;
}

export class Boards {
  constructor(private readonly hub: Hub) {}

  /** Every board that is not archived, in list order. */
  list(): Promise<BoardEntry[]> {
    return this.hub.read(WORKSPACE_DOC_ID, (workspace) => listBoards(workspace));
  }

  /** The board a caller named by key, name or id. With no name, the only board there is. Throws NotFoundError otherwise. */
  async entry(text: string | undefined): Promise<BoardEntry> {
    const boards = await this.list();
    if (text === undefined || text.trim() === '') {
      if (boards.length === 1) return boards[0]!;
      throw new NotFoundError(
        boards.length === 0
          ? 'There are no boards yet. Create one with create_board.'
          : `Say which board: ${describeBoards(boards)}.`,
      );
    }
    const found = await this.hub.read(WORKSPACE_DOC_ID, (workspace) => findBoard(workspace, text));
    if (found === null || found.archivedAt !== null) {
      throw new NotFoundError(`No board is called "${text}". The boards are: ${describeBoards(boards) || 'none yet'}.`);
    }
    return found;
  }

  async open(text: string | undefined): Promise<OpenBoard> {
    const entry = await this.entry(text);
    return { entry, board: await this.hub.read(boardDocId(entry.id), readBoard) };
  }

  /** The card a caller named by ref (`WEB-12`), by its address, or by id. Throws NotFoundError otherwise. */
  async card(text: string): Promise<OpenCard> {
    const boards = await this.list();
    // An id is tried first: it is exact, and nothing a person types as a ref is 21 characters of an id.
    for (const entry of boards) {
      const board = await this.hub.read(boardDocId(entry.id), readBoard);
      const card = board.cards.find((candidate) => candidate.id === text.trim());
      if (card !== undefined) return { entry, board, card, ref: formatCardRef(entry.key, card.number) };
    }
    const ref = parseCardRef(text);
    if (ref === null) throw new NotFoundError(`"${text}" is not a card ref such as WEB-12, a card address or a card id. Find cards with search_cards.`);
    const entry = boards.find((board) => board.key === ref.key);
    if (entry === undefined) throw new NotFoundError(`No board has the key ${ref.key}. The boards are: ${describeBoards(boards) || 'none yet'}.`);
    const board = await this.hub.read(boardDocId(entry.id), readBoard);
    const card = board.cards.find((candidate) => candidate.number === ref.number);
    if (card === undefined) throw new NotFoundError(`${entry.name} has no card ${formatCardRef(ref.key, ref.number)}. Find cards with search_cards.`);
    return { entry, board, card, ref: formatCardRef(entry.key, card.number) };
  }

  /** Changes one board's doc. `change` gets the live doc and runs in one transaction. */
  edit<T>(boardId: string, change: (doc: Y.Doc) => T): Promise<T> {
    return this.hub.edit(boardDocId(boardId), change);
  }

  /** Adds a board with the default statuses. */
  async create(input: { name: string; key?: string }): Promise<BoardEntry> {
    const entry = await this.hub.edit(WORKSPACE_DOC_ID, (workspace) => createBoard(workspace, input));
    await this.hub.edit(boardDocId(entry.id), createDefaultStatuses);
    return entry;
  }

  /**
   * Run after every stored change to a doc: gives cards that took the same
   * number, and boards that took the same key, one of their own. Replicas
   * that were apart cause both; the server is the one place that repairs it.
   */
  async repair(docId: string): Promise<void> {
    if (docId === WORKSPACE_DOC_ID) await this.hub.edit(docId, dedupeBoardKeys);
    else if (boardIdOfDoc(docId) !== null) await this.hub.edit(docId, renumberDuplicateCards);
  }
}

function describeBoards(boards: readonly BoardEntry[]): string {
  return boards.map((board) => `${board.name} (${board.key})`).join(', ');
}

/** The status a caller named by id, by name, or by kind (`todo`, `doing`, `done`: the first status of that kind). */
export function resolveStatus(board: BoardSnapshot, text: string): Status {
  const wanted = text.trim().toLowerCase();
  const found =
    board.statuses.find((status) => status.id === text.trim()) ??
    board.statuses.find((status) => status.name.toLowerCase() === wanted) ??
    board.statuses.find((status) => status.kind === wanted);
  if (found === undefined) {
    const names = board.statuses.map((status) => `${status.name} (${status.kind})`).join(', ');
    throw new NotFoundError(`No status is called "${text}". This board's statuses are: ${names || 'none yet'}.`);
  }
  return found;
}

/** The label a caller named by id or by name. */
export function resolveLabel(board: BoardSnapshot, text: string): Label {
  const wanted = text.trim().toLowerCase();
  const found = board.labels.find((label) => label.id === text.trim()) ?? board.labels.find((label) => label.name.toLowerCase() === wanted);
  if (found === undefined) {
    const names = board.labels.map((label) => label.name).join(', ');
    throw new NotFoundError(`No label is called "${text}". This board's labels are: ${names || 'none yet'}. Add one with create_label.`);
  }
  return found;
}

/** `WEB-12 "Title"`, the way a write tool names the card it changed. */
export function nameCard(key: string, card: { number: number; title: string }): string {
  return `${formatCardRef(key, card.number)} "${card.title}"`;
}

/**
 * A day a caller wrote, as stored: `YYYY-MM-DD`, or null for "none" or an
 * empty text. Throws NotFoundError for anything else, days that do not exist
 * included.
 */
export function dueDay(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'none') return null;
  const time = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? Date.parse(`${trimmed}T00:00:00Z`) : NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== trimmed) {
    throw new NotFoundError(`"${text}" is not a day. Write a day as YYYY-MM-DD, or "none" for no day.`);
  }
  return trimmed;
}
