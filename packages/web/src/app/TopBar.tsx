/**
 * The bar across the top: the mark and name, the board switcher, the board's
 * search and label filter, the sync status and the app menu. On a phone the
 * filters wrap onto a second row.
 */
import { useRef, useState } from 'react';
import { Bot, Archive, Keyboard, Menu as MenuIcon, Settings as SettingsIcon, Tags } from 'lucide-react';
import type { BoardEntry } from '@corkboard/model';
import type { CurrentBoard } from '../board/board-context.js';
import { BoardFilters } from '../board/BoardFilters.js';
import { SyncStatusControl } from '../sync-ui/SyncStatusControl.js';
import { BoardSwitcher } from '../workspace/BoardSwitcher.js';
import { IconButton, Menu } from './controls.js';
import { LogoMark } from './LogoMark.js';
import { useServices } from './services.js';
import { patchUi, type Dialog } from './ui-state.js';

export function TopBar({ entries, current }: { entries: BoardEntry[]; current: CurrentBoard | null }) {
  const { ui } = useServices();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = (dialog: Dialog) => patchUi(ui, { dialog });
  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        <LogoMark size={26} />
        <span className="brand-name">Corkboard</span>
      </div>
      <BoardSwitcher entries={entries} current={current?.entry ?? null} />
      {current && <BoardFilters current={current} />}
      <div className="top-bar-end">
        <SyncStatusControl />
        <IconButton label="Menu" ref={menuButton} onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
          <MenuIcon size={20} />
        </IconButton>
      </div>
      {menuOpen && (
        <Menu
          label="Menu"
          anchor={menuButton.current}
          onClose={() => setMenuOpen(false)}
          items={[
            { label: 'Settings', icon: <SettingsIcon size={16} />, onSelect: () => open({ kind: 'settings' }) },
            { label: 'Labels', icon: <Tags size={16} />, disabled: !current, onSelect: () => open({ kind: 'labels' }) },
            { label: 'Archived items', icon: <Archive size={16} />, disabled: !current, onSelect: () => open({ kind: 'archived' }) },
            'separator',
            { label: 'Connect an assistant', icon: <Bot size={16} />, onSelect: () => open({ kind: 'connect' }) },
            { label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, onSelect: () => open({ kind: 'shortcuts' }) },
          ]}
        />
      )}
    </header>
  );
}
