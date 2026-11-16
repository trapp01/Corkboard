/**
 * The native menu bar: App, File, Edit, View, Boards, Window, Help. Every
 * item sends a `MenuCommand` to the web client, runs one of the app's own
 * actions (`MenuActions`), or is a native role.
 */
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../../web/src/shell-bridge.js';

/** What the menu does outside the page. */
export interface MenuActions {
  send(command: MenuCommand): void;
  copyMcpAddress(): void;
  showDataFolder(): void;
  setOpenAtLogin(open: boolean): void;
}

export function menuTemplate(
  platform: NodeJS.Platform,
  actions: MenuActions,
  state: { openAtLogin: boolean },
  appName = 'Corkboard',
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin';
  const command = (label: string, name: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => actions.send(name),
  });
  const settings = command(mac ? 'Settings…' : 'Settings', 'settings', 'CmdOrCtrl+,');
  // Linux has no login items Electron can set.
  const openAtLogin: MenuItemConstructorOptions[] =
    platform === 'linux'
      ? []
      : [
          {
            label: 'Open at Login',
            type: 'checkbox',
            checked: state.openAtLogin,
            click: (item) => actions.setOpenAtLogin(item.checked),
          },
        ];

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      settings,
      ...openAtLogin,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      command('New Card', 'new-card', 'CmdOrCtrl+N'),
      command('New Board…', 'new-board', 'Shift+CmdOrCtrl+N'),
      { type: 'separator' },
      command('Connect an Assistant…', 'connect-assistant'),
      { label: 'Copy MCP Address', click: () => actions.copyMcpAddress() },
      { label: 'Show Data Folder', click: () => actions.showDataFolder() },
      { type: 'separator' },
      ...(mac
        ? [{ role: 'close' } as const]
        : [settings, ...openAtLogin, { type: 'separator' } as const, { role: 'quit' } as const]),
    ],
  };

  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      command('Find…', 'find', 'CmdOrCtrl+F'),
    ],
  };

  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'zoomIn', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus' },
      // Cmd-= is the unshifted key most people press for zoom in; macOS only honours hidden accelerators.
      { role: 'zoomIn', label: 'Zoom In', accelerator: 'CmdOrCtrl+=', visible: false, acceleratorWorksWhenHidden: true },
      { role: 'zoomOut', label: 'Zoom Out', accelerator: 'CmdOrCtrl+-' },
      { role: 'resetZoom', label: 'Actual Size', accelerator: 'CmdOrCtrl+0' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };

  const boards: MenuItemConstructorOptions = {
    label: 'Boards',
    submenu: [command('Labels…', 'labels'), command('Archived Items…', 'archived')],
  };

  const windowMenu: MenuItemConstructorOptions = {
    role: 'window',
    submenu: mac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }],
  };

  // On macOS the Help menu also holds the system's menu search; elsewhere it holds About.
  const shortcuts = command('Keyboard Shortcuts', 'shortcuts');
  const help: MenuItemConstructorOptions = { role: 'help', submenu: mac ? [shortcuts] : [shortcuts, { role: 'about' }] };

  return [...(mac ? [appMenu] : []), file, edit, view, boards, windowMenu, help];
}
