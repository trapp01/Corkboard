/**
 * What the main process does for each bridge call: argument checks, saving
 * the settings file, and restarting the app's server to apply it. Electron
 * objects stay in main.ts, so this runs in Node tests. The page's origin is
 * checked by the caller before a handler runs.
 */
import type { AppServerState, ServerLink } from '../../web/src/shell-bridge.js';
import { CHANNELS, type InvokeChannel } from './channels.js';
import { expectServerLink, loadSettings, saveSettings, type DesktopSettings } from './settings-file.js';

/** The part of `EmbeddedServer` the handlers use. */
export interface ServerHost {
  access(): ServerLink;
  state(): AppServerState;
  apply(settings: DesktopSettings): Promise<void>;
}

export interface HandlerDeps {
  server: ServerHost;
  /** The settings JSON file in user data. */
  settingsFile: string;
  /** True when a program on this computer opens addresses of this address's scheme. */
  hasAppFor(address: string): boolean;
  /** Hands an address to the operating system to open. */
  openExternal(address: string): Promise<void>;
  /** The in-app updater: the version waiting for the app to quit, or null, and quitting to install it. */
  update: { readyVersion(): string | null; restart(): void };
}

export type Handler = (args: unknown[]) => Promise<unknown>;

export function expectArgCount(args: unknown[], count: number, channel: string): void {
  if (args.length !== count) throw new TypeError(`${channel} takes ${count} argument(s), got ${args.length}`);
}

/** A link, or null to remove it. */
export function expectLinkOrNull(value: unknown): ServerLink | null {
  return value === null ? null : expectServerLink(value, 'link');
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True when `url` names the app's own server: a loopback host on the same port. */
export function isOwnAddress(url: string, ownUrl: string): boolean {
  const a = new URL(url);
  const b = new URL(ownUrl);
  const loopback = (host: string) => LOOPBACK_HOSTS.has(host) || /^127\.\d+\.\d+\.\d+$/.test(host);
  const port = (u: URL) => u.port || (u.protocol === 'https:' ? '443' : '80');
  return loopback(a.hostname) && loopback(b.hostname) && port(a) === port(b);
}

/**
 * True when `url` is a page of `origin`: the same scheme, host and port. A
 * `blob:` or `filesystem:` URL made by that origin is not one of its pages.
 */
export function isSameOrigin(url: string, origin: string): boolean {
  try {
    const [a, b] = [new URL(url), new URL(origin)];
    return a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}

export function createHandlers(deps: HandlerDeps): Record<InvokeChannel, Handler> {
  async function save(change: Partial<DesktopSettings>): Promise<AppServerState> {
    const settings = { ...loadSettings(deps.settingsFile), ...change };
    // Saved only once the server runs with them, so a link that cannot start is not there at the next launch.
    await deps.server.apply(settings);
    saveSettings(deps.settingsFile, settings);
    return deps.server.state();
  }

  return {
    async [CHANNELS.serverAccess](args) {
      expectArgCount(args, 0, CHANNELS.serverAccess);
      return deps.server.access();
    },

    async [CHANNELS.serverState](args) {
      expectArgCount(args, 0, CHANNELS.serverState);
      return deps.server.state();
    },

    async [CHANNELS.setUpstream](args) {
      expectArgCount(args, 1, CHANNELS.setUpstream);
      const upstream = expectLinkOrNull(args[0]);
      if (upstream !== null && isOwnAddress(upstream.url, deps.server.access().url)) {
        throw new Error('That is this app’s own address. Enter the address of another Corkboard server.');
      }
      return save({ upstream });
    },

    async [CHANNELS.setLooseleaf](args) {
      expectArgCount(args, 1, CHANNELS.setLooseleaf);
      return save({ looseleaf: expectLinkOrNull(args[0]) });
    },

    async [CHANNELS.updateReady](args) {
      expectArgCount(args, 0, CHANNELS.updateReady);
      return deps.update.readyVersion();
    },

    async [CHANNELS.restartToUpdate](args) {
      expectArgCount(args, 0, CHANNELS.restartToUpdate);
      if (deps.update.readyVersion() !== null) deps.update.restart();
    },

    async [CHANNELS.openLooseleafPage](args) {
      expectArgCount(args, 2, CHANNELS.openLooseleafPage);
      const [appAddress, webAddress] = args;
      // The page chooses what the operating system opens, so only a Looseleaf page address and an http(s) address pass.
      if (typeof appAddress !== 'string' || !/^looseleaf:\/\/page\/[A-Za-z0-9_-]+$/.test(appAddress)) {
        throw new TypeError('appAddress must be a looseleaf://page/<pageId> address');
      }
      if (webAddress !== null && (typeof webAddress !== 'string' || !/^https?:\/\/\S+$/i.test(webAddress))) {
        throw new TypeError('webAddress must be an http(s) address or null');
      }
      const address = deps.hasAppFor(appAddress) ? appAddress : webAddress;
      if (address === null) return false;
      await deps.openExternal(address);
      return true;
    },
  };
}
