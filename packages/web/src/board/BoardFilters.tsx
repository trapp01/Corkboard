/**
 * The board's search field and label filter in the top bar, with a count of
 * the cards showing and a way to clear both while either is on.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, Tag, X } from 'lucide-react';
import { shownCards } from '@corkboard/model';
import { Popover } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { NO_FILTER, patchUi, type BoardFilter } from '../app/ui-state.js';
import { LabelChip } from '../labels/LabelChip.js';
import type { CurrentBoard } from './board-context.js';
import { isFiltering, liveFilter, matchingCardIds } from './filter.js';

export function BoardFilters({ current }: { current: CurrentBoard }) {
  const { ui } = useServices();
  const state = useStore(ui);
  const filter = liveFilter(current.board, state.filter);
  const input = useRef<HTMLInputElement>(null);
  const labelButton = useRef<HTMLButtonElement>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const setFilter = (patch: Partial<BoardFilter>) => patchUi(ui, { filter: { ...filter, ...patch } });

  useEffect(() => {
    if (state.focusSearch > 0) input.current?.focus();
  }, [state.focusSearch]);

  const counts = useMemo(() => {
    const matches = matchingCardIds(current.board, filter);
    const total = shownCards(current.board).length;
    return { shown: matches === null ? total : shownCards(current.board).filter((card) => matches.has(card.id)).length, total };
  }, [current.board, filter]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (filter.query !== '') setFilter({ query: '' });
    else input.current?.blur();
  };

  const toggleLabel = (labelId: string) =>
    setFilter({ labelIds: filter.labelIds.includes(labelId) ? filter.labelIds.filter((id) => id !== labelId) : [...filter.labelIds, labelId] });

  return (
    <div className="board-filters">
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="Search cards"
          placeholder="Search cards"
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <kbd className="search-hint" aria-hidden="true">
          /
        </kbd>
      </label>
      <button
        ref={labelButton}
        type="button"
        className={`button filter-button ${filter.labelIds.length > 0 ? 'is-on' : ''}`}
        onClick={() => setLabelsOpen((o) => !o)}
        aria-expanded={labelsOpen}
      >
        <Tag size={16} aria-hidden="true" />
        <span>{filter.labelIds.length > 0 ? `Labels (${filter.labelIds.length})` : 'Labels'}</span>
      </button>
      {isFiltering(filter) && (
        <div className="filter-status">
          <span className="filter-count" aria-live="polite">
            {counts.shown} of {counts.total} cards
          </span>
          <button type="button" className="button subtle" onClick={() => patchUi(ui, { filter: NO_FILTER })}>
            <X size={14} aria-hidden="true" />
            Clear filters
          </button>
        </div>
      )}
      {labelsOpen && (
        <Popover anchor={labelButton.current} onClose={() => setLabelsOpen(false)} className="label-filter" label="Filter by label">
          {current.board.labels.length === 0 ? (
            <p className="muted popover-note">This board has no labels yet. Add them from the menu under Labels.</p>
          ) : (
            <ul className="check-list">
              {current.board.labels.map((label) => (
                <li key={label.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={filter.labelIds.includes(label.id)} onChange={() => toggleLabel(label.id)} />
                    <LabelChip label={label} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}
