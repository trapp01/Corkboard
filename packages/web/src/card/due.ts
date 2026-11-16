/** How a card's due day reads on its front. */
import type { StatusKind } from '@corkboard/model';

export type DueState = 'none' | 'upcoming' | 'today' | 'overdue' | 'finished';

/**
 * Whether a due day has passed. Days compare as `YYYY-MM-DD` strings. A card
 * in a `done` status is finished whatever its day, so it is never overdue.
 */
export function dueState(due: string | null, today: string, kind: StatusKind | null): DueState {
  if (due === null) return 'none';
  if (kind === 'done') return 'finished';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}
