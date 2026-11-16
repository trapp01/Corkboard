/**
 * The one way components read a board: `useBoard(doc)` re-reads the board
 * doc after every change and hands back a plain `BoardSnapshot`, plus the ids
 * of cards that a change from elsewhere (sync: an agent or another device)
 * touched in the last FLASH_MS, so the board can show them changing.
 */
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { readBoard, type BoardSnapshot } from '@corkboard/model';
import { changedCardIds } from './live-changes.js';

export const FLASH_MS = 1600;

const NONE: ReadonlySet<string> = new Set();

export interface LiveBoard {
  board: BoardSnapshot | null;
  /** Cards changed from elsewhere moments ago. */
  flashing: ReadonlySet<string>;
}

export function useBoard(doc: Y.Doc | null): LiveBoard {
  const [state, setState] = useState<{ doc: Y.Doc | null; board: BoardSnapshot | null; flashing: ReadonlySet<string> }>(() => ({
    doc,
    board: doc ? readBoard(doc) : null,
    flashing: NONE,
  }));

  useEffect(() => {
    if (!doc) {
      setState({ doc: null, board: null, flashing: NONE });
      return;
    }
    let board = readBoard(doc);
    let flashing = new Map<string, ReturnType<typeof setTimeout>>();
    const publish = () => setState({ doc, board, flashing: flashing.size === 0 ? NONE : new Set(flashing.keys()) });
    publish();
    const onUpdate = (_update: Uint8Array, _origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      const next = readBoard(doc);
      // Transactions applied from sync or another tab are not local; edits made here are.
      if (!transaction.local) {
        for (const id of changedCardIds(board, next)) {
          clearTimeout(flashing.get(id));
          flashing.set(
            id,
            setTimeout(() => {
              flashing.delete(id);
              publish();
            }, FLASH_MS),
          );
        }
      }
      board = next;
      publish();
    };
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
      for (const timer of flashing.values()) clearTimeout(timer);
      flashing = new Map();
    };
  }, [doc]);

  return state.doc === doc ? { board: state.board, flashing: state.flashing } : { board: doc ? readBoard(doc) : null, flashing: NONE };
}
