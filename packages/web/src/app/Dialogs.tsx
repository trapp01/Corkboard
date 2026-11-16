/** Renders whichever dialog the UI state names; there is at most one. Board dialogs need a board on screen. */
import { useCallback, useContext } from 'react';
import { ArchivedItemsDialog } from '../archive/ArchivedItemsDialog.js';
import { BoardContext } from '../board/board-context.js';
import { LabelsDialog } from '../labels/LabelsDialog.js';
import { BoardSettingsDialog } from '../workspace/BoardSettingsDialog.js';
import { NewBoardDialog } from '../workspace/NewBoardDialog.js';
import { ConnectAssistant } from './ConnectAssistant.js';
import { Dialog } from './controls.js';
import { useServices } from './services.js';
import { Settings } from './Settings.js';
import { SHORTCUTS } from './shortcuts.js';
import { useStore } from './store.js';
import { patchUi } from './ui-state.js';

export function Dialogs() {
  const { ui } = useServices();
  const current = useContext(BoardContext);
  const dialog = useStore(ui).dialog;
  const close = useCallback(() => patchUi(ui, { dialog: null }), [ui]);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'settings':
      return <Settings onClose={close} />;
    case 'connect':
      return <ConnectAssistant onClose={close} />;
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />;
    case 'new-board':
      return <NewBoardDialog onClose={close} />;
    case 'labels':
      return current && <LabelsDialog onClose={close} />;
    case 'archived':
      return current && <ArchivedItemsDialog onClose={close} />;
    case 'board-settings':
      return current && <BoardSettingsDialog onClose={close} />;
  }
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcut-list">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="shortcut-row">
            <dt>
              <kbd>{shortcut.keys}</kbd>
            </dt>
            <dd>{shortcut.does}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Shortcuts don’t fire while you type in a field. To drag with the keyboard, focus a card or a status header, press Space to lift it, move it with the arrow keys, and press Space again to drop it.</p>
    </Dialog>
  );
}
