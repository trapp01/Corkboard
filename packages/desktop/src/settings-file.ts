/**
 * The app's settings, kept in one JSON file in user data between launches:
 * the server to sync with (the upstream), the Looseleaf server, and the port
 * used last time 8422 was taken. The file holds access tokens, so it is
 * written with mode 0600. What a valid server link is lives here too, so a
 * link read from the file and a link sent by the page pass the same rule.
 */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { normalizeServerAddress } from '@corkboard/sync';
import type { ServerLink } from '../../web/src/shell-bridge.js';

export interface DesktopSettings {
  upstream: ServerLink | null;
  looseleaf: ServerLink | null;
  /**
   * The port the app's server used the last time 8422 was taken. It is tried
   * before a random port, so the window keeps its origin, and with it the
   * name and boards this window has stored, while 8422 stays taken.
   */
  fallbackPort: number | null;
}

export const NO_SETTINGS: DesktopSettings = { upstream: null, looseleaf: null, fallbackPort: null };

const MAX_URL_LENGTH = 2048;
const MAX_TOKEN_LENGTH = 4096;

/** A server link with a normalized http(s) address and a trimmed token; throws a TypeError naming `what` otherwise. */
export function expectServerLink(value: unknown, what: string): ServerLink {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${what} must be an object with url and token`);
  const { url, token, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) throw new TypeError(`${what} has unexpected fields: ${Object.keys(rest).join(', ')}`);
  if (typeof url !== 'string' || url.trim() === '' || url.length > MAX_URL_LENGTH) {
    throw new TypeError(`${what}.url must be 1 to ${MAX_URL_LENGTH} characters`);
  }
  if (typeof token !== 'string' || token.trim() === '' || token.length > MAX_TOKEN_LENGTH) {
    throw new TypeError(`${what}.token must be 1 to ${MAX_TOKEN_LENGTH} characters`);
  }
  let normalized: string;
  try {
    normalized = normalizeServerAddress(url);
  } catch {
    throw new TypeError('Enter an address that starts with http:// or https://, like http://nas:8422');
  }
  return { url: normalized, token: token.trim() };
}

function linkOrNull(value: unknown): ServerLink | null {
  if (value === null || value === undefined) return null;
  try {
    return expectServerLink(value, 'link');
  } catch {
    return null;
  }
}

function portOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536 ? value : null;
}

/** The saved settings. A missing file means none; a damaged file or field is reported and treated as unset. */
export function loadSettings(file: string): DesktopSettings {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Could not read ${file}; starting with no linked servers`, error);
    return { ...NO_SETTINGS };
  }
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    console.warn(`${file} is not valid JSON; starting with no linked servers`);
    return { ...NO_SETTINGS };
  }
  const s = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};
  return { upstream: linkOrNull(s.upstream), looseleaf: linkOrNull(s.looseleaf), fallbackPort: portOrNull(s.fallbackPort) };
}

/** Replaces the file whole through a rename, readable by this user only from its first byte. */
export function saveSettings(file: string, settings: DesktopSettings): void {
  const partial = `${file}.partial`;
  // A partial file left by a crash keeps whatever mode it had; a new one is made with this mode.
  rmSync(partial, { force: true });
  const handle = openSync(partial, 'wx', 0o600);
  try {
    writeSync(handle, `${JSON.stringify(settings, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(partial, file);
}
