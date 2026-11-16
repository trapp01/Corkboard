/** Which cards the search field and the label filter leave showing on a board. */
import { searchCards, type BoardSnapshot } from '@corkboard/model';
import type { BoardFilter } from '../app/ui-state.js';

export function isFiltering(filter: BoardFilter): boolean {
  return filter.query.trim() !== '' || filter.labelIds.length > 0;
}

/**
 * The ids of the cards that pass the filter, or null when no filter is on and
 * every card shows. A card passes when it has every word of the query (see
 * model's `searchCards`) and carries any one of the selected labels.
 */
export function matchingCardIds(board: BoardSnapshot, filter: BoardFilter): Set<string> | null {
  if (!isFiltering(filter)) return null;
  const labels = new Set(filter.labelIds);
  const ids = new Set<string>();
  for (const card of searchCards(board, { query: filter.query })) {
    if (labels.size > 0 && !card.labelIds.some((id) => labels.has(id))) continue;
    ids.add(card.id);
  }
  return ids;
}

/** The filter with label ids that no longer exist on the board dropped, so a deleted label cannot hide every card. */
export function liveFilter(board: BoardSnapshot, filter: BoardFilter): BoardFilter {
  const kept = filter.labelIds.filter((id) => board.labels.some((label) => label.id === id));
  return kept.length === filter.labelIds.length ? filter : { ...filter, labelIds: kept };
}
