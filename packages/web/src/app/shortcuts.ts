/**
 * The single-key shortcuts: `/` search, `?` the shortcuts list, `n` a card in
 * the hovered (or first) status, and on the hovered or focused card Enter to
 * open it and `c` to archive it. None fire while typing in a field, with a
 * modifier held, or while a dialog, card or menu is open; Escape belongs to
 * whatever is open (see escape.ts).
 */
import { useEffect, useRef } from 'react';
import { cardPath, formatCardRef } from '@corkboard/model';
import type { CurrentBoard } from '../board/board-context.js';
import { archiveWithUndo } from '../card/card-actions.js';
import { anyLayerOpen } from './escape.js';
import type { Services } from './services.js';
import { patchUi } from './ui-state.js';

export const SHORTCUTS: ReadonlyArray<{ keys: string; does: string }> = [
  { keys: 'n', does: 'Add a card to the status under the pointer, or the first status' },
  { keys: '/', does: 'Search the cards on this board' },
  { keys: 'Enter', does: 'Open the card under the pointer or in focus' },
  { keys: 'c', does: 'Archive the card under the pointer or in focus' },
  { keys: '?', does: 'Show these shortcuts' },
  { keys: 'Esc', does: 'Close whatever is open' },
];

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest?.('input, textarea, select, [contenteditable="true"]');
}

/** The card under the pointer, else the card holding focus. */
function targetCardId(services: Services): string | null {
  const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-card-id]');
  return services.hover.get().cardId ?? focused?.dataset.cardId ?? null;
}

export function useShortcuts(services: Services, current: CurrentBoard | null): void {
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || anyLayerOpen()) return;
      const board = latest.current;
      const act = (run: () => void) => {
        event.preventDefault();
        run();
      };
      switch (event.key) {
        case '/':
          return act(() => services.ui.update((ui) => ({ ...ui, focusSearch: ui.focusSearch + 1 })));
        case '?':
          return act(() => patchUi(services.ui, { dialog: { kind: 'shortcuts' } }));
      }
      if (!board) return;
      if (event.key === 'n') {
        const statusId = services.hover.get().statusId ?? board.board.statuses[0]?.id ?? null;
        if (statusId) act(() => patchUi(services.ui, { composer: statusId }));
        return;
      }
      if (event.key !== 'Enter' && event.key !== 'c') return;
      const cardId = targetCardId(services);
      const card = cardId ? board.board.cards.find((candidate) => candidate.id === cardId) : undefined;
      if (!card || card.archivedAt !== null) return;
      if (event.key === 'Enter') act(() => services.router.navigate(cardPath(formatCardRef(board.entry.key, card.number))));
      else
        act(() => {
          services.hover.set({ ...services.hover.get(), cardId: null });
          archiveWithUndo(services, board.doc, card, board.entry.key);
        });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [services]);
}
