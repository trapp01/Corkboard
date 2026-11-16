/**
 * The one channel between the web client and the desktop app. The app's
 * preload script sets `window.corkboardShell` to an object of this shape; in a
 * plain browser it is absent and every caller falls back to what the browser
 * offers. The app runs its own server on this computer and shows this page
 * from it, so the bridge is about that server: how to reach it, and which
 * other servers it is linked to.
 */
export interface ShellBridge {
  kind: 'desktop';
  platform: 'darwin' | 'win32' | 'linux';

  /** The address and access token of the server the app runs, which this window syncs with. */
  serverAccess(): Promise<ServerLink>;

  /** What the app's server is linked to, and whether the link to the server to sync with is up. */
  serverState(): Promise<AppServerState>;

  /**
   * Saves the server to sync with (the upstream), or removes it when given
   * null, and restarts the app's server on the same port to apply it. Rejects
   * with a sentence for a malformed address or this app's own address. The
   * caller checks that the address is a Corkboard server that takes the token.
   */
  setUpstream(link: ServerLink | null): Promise<AppServerState>;

  /** Saves the Looseleaf server linked pages are read from, or removes it when given null, and restarts the app's server. */
  setLooseleaf(link: ServerLink | null): Promise<AppServerState>;

  /** Calls the listener whenever `serverState` would answer differently. Returns unsubscribe. */
  onServerState(listener: (state: AppServerState) => void): () => void;

  /** Calls the listener when a native menu item is chosen. Returns unsubscribe. */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}

/** A server's address and its access token. */
export interface ServerLink {
  url: string;
  token: string;
}

export interface AppServerState {
  /** The app's own server, e.g. `http://127.0.0.1:8422`. Agents on this computer reach it at `/mcp`. */
  url: string;
  /** The server to sync with, or null when boards stay on this computer only. */
  upstream: { url: string; connected: boolean; tokenRefused: boolean } | null;
  /** The Looseleaf server linked pages are read from, or null. */
  looseleaf: { url: string } | null;
}

/** Commands a native menu can send. The web client runs the same action as its own control. */
export type MenuCommand =
  | 'settings'
  | 'new-card'
  | 'new-board'
  | 'find'
  | 'labels'
  | 'archived'
  | 'connect-assistant'
  | 'shortcuts';

// A global rather than a Window property, so the desktop package can type-check this file without the DOM library.
declare global {
  var corkboardShell: ShellBridge | undefined;
}

export function shell(): ShellBridge | null {
  return globalThis.corkboardShell ?? null;
}

/** The sentence a bridge call rejected with, without the "Error invoking remote method" prefix Electron adds. */
export function bridgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
}
