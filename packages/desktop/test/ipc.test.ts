import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AppServerState } from '../../web/src/shell-bridge.js';
import { CHANNELS } from '../src/channels.js';
import { createHandlers, isOwnAddress, isSameOrigin, type ServerHost } from '../src/ipc.js';
import { loadSettings, saveSettings, type DesktopSettings } from '../src/settings-file.js';

const OWN = 'http://127.0.0.1:8422';

function setup() {
  const settingsFile = join(mkdtempSync(join(tmpdir(), 'corkboard-ipc-')), 'settings.json');
  let applied: DesktopSettings | null = null;
  const server = {
    access: () => ({ url: OWN, token: 'own-token' }),
    state: (): AppServerState => ({
      url: OWN,
      upstream: applied?.upstream ? { url: applied.upstream.url, connected: false, tokenRefused: false } : null,
      looseleaf: applied?.looseleaf ? { url: applied.looseleaf.url } : null,
    }),
    apply: vi.fn(async (settings: DesktopSettings) => {
      applied = settings;
    }),
  } satisfies ServerHost;
  return { handlers: createHandlers({ server, settingsFile }), server, settingsFile };
}

describe('bridge handlers', () => {
  it('give the page the app server’s address and token, and its state', async () => {
    const { handlers } = setup();
    expect(await handlers[CHANNELS.serverAccess]([])).toEqual({ url: OWN, token: 'own-token' });
    expect(await handlers[CHANNELS.serverState]([])).toEqual({ url: OWN, upstream: null, looseleaf: null });
  });

  it('save a server to sync with, restart the server with it, and remove it again', async () => {
    const { handlers, server, settingsFile } = setup();
    saveSettings(settingsFile, { upstream: null, looseleaf: null, fallbackPort: 50123 });
    const state = await handlers[CHANNELS.setUpstream]([{ url: 'http://nas:8422/', token: ' t ' }]);
    expect(state).toMatchObject({ upstream: { url: 'http://nas:8422', connected: false } });
    expect(loadSettings(settingsFile)).toEqual({ upstream: { url: 'http://nas:8422', token: 't' }, looseleaf: null, fallbackPort: 50123 });
    expect(server.apply).toHaveBeenCalledTimes(1);
    expect(await handlers[CHANNELS.setUpstream]([null])).toMatchObject({ upstream: null });
    expect(loadSettings(settingsFile).upstream).toBeNull();
  });

  it('save and remove the Looseleaf server without touching the server to sync with', async () => {
    const { handlers, settingsFile } = setup();
    await handlers[CHANNELS.setUpstream]([{ url: 'http://nas:8422', token: 'u' }]);
    await handlers[CHANNELS.setLooseleaf]([{ url: 'http://127.0.0.1:8421', token: 'l' }]);
    expect(loadSettings(settingsFile)).toMatchObject({ upstream: { token: 'u' }, looseleaf: { url: 'http://127.0.0.1:8421', token: 'l' } });
    await handlers[CHANNELS.setLooseleaf]([null]);
    expect(loadSettings(settingsFile)).toMatchObject({ upstream: { token: 'u' }, looseleaf: null });
  });

  it('refuse this app’s own address as the server to sync with', async () => {
    const { handlers, server } = setup();
    for (const url of ['http://127.0.0.1:8422', 'http://localhost:8422/', 'http://[::1]:8422']) {
      await expect(handlers[CHANNELS.setUpstream]([{ url, token: 't' }])).rejects.toThrow('That is this app’s own address.');
    }
    expect(server.apply).not.toHaveBeenCalled();
  });

  it('refuse arguments of the wrong shape or count before saving anything', async () => {
    const { handlers, server, settingsFile } = setup();
    await expect(handlers[CHANNELS.serverAccess](['extra'])).rejects.toThrow(/takes 0 argument/);
    await expect(handlers[CHANNELS.setUpstream]([])).rejects.toThrow(/takes 1 argument/);
    await expect(handlers[CHANNELS.setUpstream](['http://nas:8422'])).rejects.toThrow(/link must be an object/);
    await expect(handlers[CHANNELS.setLooseleaf]([{ url: 'javascript:alert(1)', token: 't' }])).rejects.toThrow(/http:\/\//);
    await expect(handlers[CHANNELS.setLooseleaf]([{ url: 'http://ll', token: 7 }])).rejects.toThrow(/link.token/);
    expect(server.apply).not.toHaveBeenCalled();
    expect(loadSettings(settingsFile).upstream).toBeNull();
  });
});

describe('address checks', () => {
  it('recognise the app’s own server only on a loopback host and the same port', () => {
    expect(isOwnAddress('http://127.0.0.1:8422', OWN)).toBe(true);
    expect(isOwnAddress('http://127.0.0.2:8422', OWN)).toBe(true);
    expect(isOwnAddress('http://127.0.0.1:8423', OWN)).toBe(false);
    expect(isOwnAddress('http://nas:8422', OWN)).toBe(false);
  });

  it('compare origins by scheme, host and port', () => {
    expect(isSameOrigin('http://127.0.0.1:8422/c/WEB-1', OWN)).toBe(true);
    expect(isSameOrigin('http://localhost:8422/', OWN)).toBe(false);
    expect(isSameOrigin('https://127.0.0.1:8422/', OWN)).toBe(false);
    expect(isSameOrigin('not a url', OWN)).toBe(false);
    expect(isSameOrigin('blob:http://127.0.0.1:8422/3f0c', OWN)).toBe(false);
  });
});
