/**
 * The board on screen, shared with everything drawn over it (the card back,
 * the labels and archive dialogs): its workspace entry, its live doc for
 * model writers, and the snapshot to read from.
 */
import { createContext, useContext } from 'react';
import type * as Y from 'yjs';
import type { BoardEntry, BoardSnapshot } from '@corkboard/model';

export interface CurrentBoard {
  entry: BoardEntry;
  doc: Y.Doc;
  board: BoardSnapshot;
  /** Cards a change from elsewhere touched moments ago; see use-board.ts. */
  flashing: ReadonlySet<string>;
}

export const BoardContext = createContext<CurrentBoard | null>(null);

/** The board on screen. Only components rendered while a board is open may call this. */
export function useCurrentBoard(): CurrentBoard {
  const current = useContext(BoardContext);
  if (!current) throw new Error('useCurrentBoard needs a board on screen');
  return current;
}
