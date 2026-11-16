import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MenuItem, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import type { MenuCommand } from '../../web/src/shell-bridge.js';
import { menuTemplate, type MenuActions } from '../src/menu.js';

/** The MenuCommand union as written in shell-bridge.ts, so a new command fails this test until it has a menu item. */
function bridgeCommands(): string[] {
  const source = readFileSync(fileURLToPath(new URL('../../web/src/shell-bridge.ts', import.meta.url)), 'utf8');
  const union = /export type MenuCommand\s*=([^;]*);/.exec(source)?.[1];
  if (!union) throw new Error('MenuCommand not found in shell-bridge.ts');
  return [...union.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

function items(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? items(item.submenu) : [])]);
}

/** Everything each clickable item did, by label: commands as their names, actions as `action:<name>`. */
function clickAll(platform: NodeJS.Platform, openAtLogin = false): Map<string, string[]> {
  let current: string[] = [];
  const actions: MenuActions = {
    send: (command) => current.push(command),
    copyMcpAddress: () => current.push('action:copyMcpAddress'),
    showDataFolder: () => current.push('action:showDataFolder'),
    setOpenAtLogin: (open) => current.push(`action:setOpenAtLogin:${open}`),
  };
  const byLabel = new Map<string, string[]>();
  for (const item of items(menuTemplate(platform, actions, { openAtLogin }))) {
    if (!item.click) continue;
    current = [];
    // A checkbox has already flipped `checked` when Electron calls click.
    const clicked = { checked: item.type === 'checkbox' ? !item.checked : false } as MenuItem;
    (item.click as unknown as (menuItem: MenuItem) => void)(clicked);
    byLabel.set(`${item.label}${item.visible === false ? ' (hidden)' : ''}`, current);
  }
  return byLabel;
}

const noActions: MenuActions = { send: () => undefined, copyMcpAddress: () => undefined, showDataFolder: () => undefined, setOpenAtLogin: () => undefined };

describe.each(['darwin', 'win32', 'linux'] as const)('menu on %s', (platform) => {
  const template = menuTemplate(platform, noActions, { openAtLogin: false });
  const commands = new Set(bridgeCommands());

  it('has only items with a native role, a submenu, a separator, or one command or action', () => {
    for (const [label, done] of clickAll(platform)) {
      expect(done, label).toHaveLength(1);
      const what = done[0] ?? '';
      expect(what.startsWith('action:') || commands.has(what), `${label} sends ${what}`).toBe(true);
    }
    for (const item of items(template)) {
      const kind = item.type === 'separator' ? 'separator' : item.role ? 'role' : item.click ? 'command' : item.submenu ? 'submenu' : 'none';
      expect(kind, JSON.stringify(item.label ?? item.role)).not.toBe('none');
    }
  });

  it('reaches every MenuCommand in shell-bridge.ts', () => {
    const reachable = new Set([...clickAll(platform).values()].flat());
    expect([...commands].filter((c) => !reachable.has(c as MenuCommand))).toEqual([]);
  });

  it('copies the MCP address and shows the data folder from File', () => {
    const done = clickAll(platform);
    expect(done.get('Copy MCP Address')).toEqual(['action:copyMcpAddress']);
    expect(done.get('Show Data Folder')).toEqual(['action:showDataFolder']);
  });

  it('has no empty top-level menus', () => {
    for (const menu of template) {
      expect(Array.isArray(menu.submenu) ? menu.submenu.length : 0, String(menu.label ?? menu.role)).toBeGreaterThan(0);
    }
  });

  it('gives each accelerator to one visible item', () => {
    const accelerators = items(template)
      .filter((item) => item.accelerator && item.visible !== false)
      .map((item) => item.accelerator);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });
});

describe('menu layout', () => {
  it('has the app menu on macOS only, then File, Edit, View, Boards, Window and Help', () => {
    const labels = (platform: NodeJS.Platform) => menuTemplate(platform, noActions, { openAtLogin: false }).map((m) => m.label ?? m.role);
    expect(labels('darwin')).toEqual(['Corkboard', 'File', 'Edit', 'View', 'Boards', 'window', 'help']);
    expect(labels('win32')).toEqual(['File', 'Edit', 'View', 'Boards', 'window', 'help']);
  });

  it('shows Open at Login as a checkbox holding the current setting, and passes the new one on', () => {
    const find = (platform: NodeJS.Platform, openAtLogin: boolean) =>
      items(menuTemplate(platform, noActions, { openAtLogin })).find((item) => item.label === 'Open at Login');
    expect(find('darwin', true)).toMatchObject({ type: 'checkbox', checked: true });
    expect(find('win32', false)).toMatchObject({ type: 'checkbox', checked: false });
    expect(find('linux', false)).toBeUndefined();
    expect(clickAll('darwin', false).get('Open at Login')).toEqual(['action:setOpenAtLogin:true']);
    expect(clickAll('darwin', true).get('Open at Login')).toEqual(['action:setOpenAtLogin:false']);
  });

  it('puts the shortcuts on New Card, New Board, Find and Settings', () => {
    const byLabel = new Map(items(menuTemplate('darwin', noActions, { openAtLogin: false })).map((i) => [i.label, i.accelerator]));
    expect(byLabel.get('New Card')).toBe('CmdOrCtrl+N');
    expect(byLabel.get('New Board…')).toBe('Shift+CmdOrCtrl+N');
    expect(byLabel.get('Find…')).toBe('CmdOrCtrl+F');
    expect(byLabel.get('Settings…')).toBe('CmdOrCtrl+,');
  });
});
