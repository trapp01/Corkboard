import { nanoid } from 'nanoid';

/** A new 21-character nanoid for a board, status, label, card or anything on a card. */
export function newId(): string {
  return nanoid();
}

/** The id of the doc that lists every board. */
export const WORKSPACE_DOC_ID = 'workspace';

const BOARD_DOC_PREFIX = 'board:';

/** The id of the doc that holds one board's statuses, labels and cards. */
export function boardDocId(boardId: string): string {
  return `${BOARD_DOC_PREFIX}${boardId}`;
}

/** The board id a doc id names, or null for any other doc. */
export function boardIdOfDoc(docId: string): string | null {
  return docId.startsWith(BOARD_DOC_PREFIX) ? docId.slice(BOARD_DOC_PREFIX.length) : null;
}
