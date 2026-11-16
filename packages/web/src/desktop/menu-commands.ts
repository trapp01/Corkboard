/**
 * Runs the desktop app's native menu items in the page. Each command does
 * what the matching control on the page does; one that needs a board does
 * nothing while none is open.
 */
import { useEffect, useRef } from 'react';
import type { CurrentBoard } from '../board/board-context.js';
import type { Services } from '../app/services.js';
import { patchUi } from '../app/ui-state.js';
import { shell, type MenuCommand } from '../shell-bridge.js';

export function runMenuCommand(services: Services, current: CurrentBoard | null, command: MenuCommand): void {
  const { ui } = services;
  switch (command) {
    case 'settings':
      return patchUi(ui, { dialog: { kind: 'settings' } });
    case 'new-board':
      return patchUi(ui, { dialog: { kind: 'new-board' } });
    case 'connect-assistant':
      return patchUi(ui, { dialog: { kind: 'connect' } });
    case 'shortcuts':
      return patchUi(ui, { dialog: { kind: 'shortcuts' } });
  }
  if (!current) return;
  switch (command) {
    case 'new-card': {
      const statusId = current.board.statuses[0]?.id ?? null;
      if (statusId) patchUi(ui, { dialog: null, composer: statusId });
      return;
    }
    case 'find':
      return ui.update((state) => ({ ...state, dialog: null, focusSearch: state.focusSearch + 1 }));
    case 'labels':
      return patchUi(ui, { dialog: { kind: 'labels' } });
    case 'archived':
      return patchUi(ui, { dialog: { kind: 'archived' } });
  }
}

/** Listens for menu commands while the app is on screen. */
export function useMenuCommands(services: Services, current: CurrentBoard | null): void {
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => shell()?.onMenuCommand((command) => runMenuCommand(services, latest.current, command)), [services]);
}
