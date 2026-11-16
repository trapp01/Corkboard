/**
 * Transient view state shared across the app: which dialog is open, the
 * board's filters, which status has its card composer open, and what the
 * pointer is over (for shortcuts that act on the hovered card). Nothing here
 * is synced; the route lives in router.ts.
 */
import { Store } from './store.js';

export type Dialog =
  | { kind: 'settings' }
  | { kind: 'labels' }
  | { kind: 'archived' }
  | { kind: 'connect' }
  | { kind: 'shortcuts' }
  | { kind: 'new-board' }
  | { kind: 'board-settings' };

export interface BoardFilter {
  /** Words typed in the search field. */
  query: string;
  /** A card shows when it carries any of these labels; none selected means no label filter. */
  labelIds: string[];
}

export const NO_FILTER: BoardFilter = { query: '', labelIds: [] };

export interface UiState {
  dialog: Dialog | null;
  filter: BoardFilter;
  /** The status whose "Add a card" composer is open. */
  composer: string | null;
  /** Bumped to move focus to the search field. */
  focusSearch: number;
}

export function createUiState(): Store<UiState> {
  return new Store<UiState>({ dialog: null, filter: NO_FILTER, composer: null, focusSearch: 0 });
}

export function patchUi(store: Store<UiState>, patch: Partial<UiState>): void {
  store.update((s) => ({ ...s, ...patch }));
}

/** The status and card under the pointer or holding focus, for the `n`, Enter and `c` shortcuts. */
export interface Hover {
  statusId: string | null;
  cardId: string | null;
}
