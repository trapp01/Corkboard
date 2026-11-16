/**
 * Finding and checking a server before the sync client is told about it:
 * whether this page was served by a Corkboard server, and whether an address
 * and token work. Errors come back as sentences a person can act on.
 */
import { BLOBS_PATH, fetchServerInfo, INFO_PATH, normalizeServerAddress } from '@corkboard/sync';

const DETECT_TIMEOUT_MS = 4000;

/** The address of the server that served this page, or null when it was not a Corkboard server. */
export async function detectHostServer(): Promise<string | null> {
  if (!/^https?:$/.test(location.protocol)) return null;
  const address = normalizeServerAddress(location.origin);
  try {
    await withTimeout(fetchServerInfo(address), DETECT_TIMEOUT_MS);
    return address;
  } catch {
    return null;
  }
}

/** Resolves to the normalized address when it is a reachable Corkboard server that accepts the token; throws a plain message otherwise. */
export async function checkServer(address: string, token: string): Promise<string> {
  const normalized = parseAddress(address, 'http://nas:8422', token);
  try {
    await withTimeout(fetchServerInfo(normalized), 10_000);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('is not a Corkboard server')) throw new Error(`${normalized} answered, but it isn’t a Corkboard server.`);
    if (message.includes('speaks sync protocol')) throw new Error('This server runs a different version. Update the server or reload this page.');
    throw new Error(unreachable(normalized));
  }
  await checkToken(normalized, token);
  return normalized;
}

/** The same check for a Looseleaf server, which the desktop app's server reads linked pages from. */
export async function checkLooseleaf(address: string, token: string): Promise<string> {
  const normalized = parseAddress(address, 'http://nas:8421', token);
  let name: unknown = null;
  try {
    const response = await withTimeout(fetch(`${normalized}${INFO_PATH}`), 10_000);
    if (response.ok) name = ((await response.json()) as { name?: unknown }).name;
  } catch {
    throw new Error(unreachable(normalized));
  }
  if (name !== 'looseleaf') throw new Error(`${normalized} answered, but it isn’t a Looseleaf server.`);
  await checkToken(normalized, token);
  return normalized;
}

function parseAddress(address: string, example: string, token: string): string {
  let normalized: string;
  try {
    normalized = normalizeServerAddress(address);
  } catch {
    throw new Error(`Enter an address that starts with http:// or https://, like ${example}`);
  }
  if (token.trim() === '') throw new Error('Enter the access token.');
  return normalized;
}

function unreachable(address: string): string {
  return `Can’t reach ${address}. Check the address and that the server is running.`;
}

/** Asks a route that needs the token; Corkboard and Looseleaf servers both list blobs only for it. */
async function checkToken(address: string, token: string): Promise<void> {
  let status: number;
  try {
    const response = await fetch(`${address}${BLOBS_PATH}`, { headers: { Authorization: `Bearer ${token.trim()}` } });
    status = response.status;
  } catch {
    throw new Error(unreachable(address));
  }
  if (status === 401 || status === 403) throw new Error('The server refused this access token. Check it and try again.');
  if (status >= 400) throw new Error(`The server answered with an error (${status}). Try again in a moment.`);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}
