/** Reading the workspace doc: every board, archived ones included, in list order. */
import type * as Y from 'yjs';
import { listBoards, type BoardEntry } from '@corkboard/model';
import { readLocal, writeLocal } from '../app/local-settings.js';
import { useYValue } from '../app/yjs-hooks.js';

export function useBoardEntries(workspace: Y.Doc): BoardEntry[] {
  return useYValue(workspace, () => listBoards(workspace, { includeArchived: true }));
}

const LAST_BOARD_KEY = 'lastBoard';

/** The board `/` opens: the last one opened on this device while it is still there and not archived, else the first. */
export function homeBoard(entries: readonly BoardEntry[]): BoardEntry | null {
  const live = entries.filter((entry) => entry.archivedAt === null);
  const last = readLocal<string | null>(LAST_BOARD_KEY, null);
  return live.find((entry) => entry.id === last) ?? live[0] ?? null;
}

export function rememberBoard(boardId: string): void {
  writeLocal(LAST_BOARD_KEY, boardId);
}
