/**
 * The board switcher in the top bar: the open board's colour and name, and a
 * list of every board in order with "New board…", "Board settings…" and the
 * archived boards under a disclosure, each with Restore.
 */
import { useRef, useState } from 'react';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import { boardPath, restoreBoard, type BoardEntry } from '@corkboard/model';
import { Popover } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { patchUi } from '../app/ui-state.js';

export function BoardSwitcher({ entries, current }: { entries: BoardEntry[]; current: BoardEntry | null }) {
  const { router, ui, workspace } = useServices();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const live = entries.filter((entry) => entry.archivedAt === null);
  const archived = entries.filter((entry) => entry.archivedAt !== null);
  const go = (entry: BoardEntry) => {
    setOpen(false);
    router.navigate(boardPath(entry.key));
  };
  const dialog = (kind: 'new-board' | 'board-settings') => {
    setOpen(false);
    patchUi(ui, { dialog: { kind } });
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className="board-switcher"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={current ? `Board: ${current.name}. Switch board` : 'Choose a board'}
      >
        {current && <span className={`board-dot color-${current.color}`} aria-hidden="true" />}
        <span className="board-switcher-name">{current ? current.name : 'Boards'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <Popover anchor={button.current} onClose={() => setOpen(false)} className="board-menu" label="Boards">
          <ul className="board-list">
            {live.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={`board-row ${entry.id === current?.id ? 'is-current' : ''}`} onClick={() => go(entry)} aria-current={entry.id === current?.id ? 'page' : undefined}>
                  <span className={`board-dot color-${entry.color}`} aria-hidden="true" />
                  <span className="board-row-name">{entry.name}</span>
                  <span className="board-key">{entry.key}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="board-menu-actions">
            <button type="button" className="board-row" onClick={() => dialog('new-board')}>
              <Plus size={16} aria-hidden="true" />
              <span>New board…</span>
            </button>
            {current && current.archivedAt === null && (
              <button type="button" className="board-row" onClick={() => dialog('board-settings')}>
                <Settings2 size={16} aria-hidden="true" />
                <span>Board settings…</span>
              </button>
            )}
          </div>
          {archived.length > 0 && (
            <details className="archived-boards">
              <summary>Archived boards ({archived.length})</summary>
              <ul className="board-list">
                {archived.map((entry) => (
                  <li key={entry.id} className="archived-board-row">
                    <span className={`board-dot color-${entry.color}`} aria-hidden="true" />
                    <span className="board-row-name">{entry.name}</span>
                    <button type="button" className="button subtle" onClick={() => restoreBoard(workspace, entry.id)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Popover>
      )}
    </>
  );
}
