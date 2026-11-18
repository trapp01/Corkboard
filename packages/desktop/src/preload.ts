/**
 * Runs in the sandboxed page before the web client and sets
 * `window.corkboardShell`. Every call becomes an IPC message; the main process
 * checks the page's origin and the arguments.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AppServerState, MenuCommand, ShellBridge } from '../../web/src/shell-bridge.js';
import { CHANNELS } from './channels.js';

function platform(): ShellBridge['platform'] {
  const p = process.platform;
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p;
  throw new Error(`Corkboard's desktop app does not run on ${p}`);
}

/** Forwards one main → page channel to a listener; returns unsubscribe. */
function listen<T>(channel: string, listener: (value: T) => void): () => void {
  if (typeof listener !== 'function') throw new TypeError(`${channel} needs a function`);
  const forward = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
}

const bridge: ShellBridge = {
  kind: 'desktop',
  platform: platform(),
  serverAccess: () => ipcRenderer.invoke(CHANNELS.serverAccess),
  serverState: () => ipcRenderer.invoke(CHANNELS.serverState),
  setUpstream: (link) => ipcRenderer.invoke(CHANNELS.setUpstream, link),
  setLooseleaf: (link) => ipcRenderer.invoke(CHANNELS.setLooseleaf, link),
  openLooseleafPage: (appAddress, webAddress) => ipcRenderer.invoke(CHANNELS.openLooseleafPage, appAddress, webAddress),
  onUpdateReady(listener) {
    const unsubscribe = listen<string>(CHANNELS.updateReadyEvent, listener);
    // An update that was ready before this page loaded sent its event to no one.
    void ipcRenderer.invoke(CHANNELS.updateReady).then((version: string | null) => {
      if (version !== null) listener(version);
    });
    return unsubscribe;
  },
  restartToUpdate: () => ipcRenderer.invoke(CHANNELS.restartToUpdate),
  onServerState: (listener) => listen<AppServerState>(CHANNELS.serverStateChanged, listener),
  onMenuCommand: (listener) => listen<MenuCommand>(CHANNELS.menuCommand, listener),
};

contextBridge.exposeInMainWorld('corkboardShell', bridge);
