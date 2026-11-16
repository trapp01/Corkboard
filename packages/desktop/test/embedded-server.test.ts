import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { portAnswers, startServer } from '@corkboard/server';
import { EmbeddedServer, portsToTry } from '../src/embedded-server.js';
import { NO_SETTINGS } from '../src/settings-file.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function dataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'corkboard-desktop-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Another program holding a port on every interface, as a server started with `pnpm start` does. */
async function occupiedPort(): Promise<number> {
  const other: Server = createServer((socket) => socket.end());
  await new Promise<void>((resolve) => other.listen(0, resolve));
  cleanups.push(() => new Promise((resolve) => other.close(() => resolve())));
  const address = other.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return address.port;
}

async function embedded(preferredPort: number, fallbackPort: number | null = null) {
  const server = new EmbeddedServer({ dataDir: await dataDir(), webDir: null, preferredPort });
  await server.start({ ...NO_SETTINGS, fallbackPort });
  cleanups.push(() => server.close());
  return server;
}

describe('portsToTry', () => {
  it('tries the preferred port, then the remembered one, then any free port', () => {
    expect(portsToTry(8422, null)).toEqual([8422, 0]);
    expect(portsToTry(8422, 50123)).toEqual([8422, 50123, 0]);
    expect(portsToTry(8422, 8422)).toEqual([8422, 0]);
    expect(portsToTry(0, 50123)).toEqual([0, 50123]);
  });
});

describe('the app’s server', () => {
  it('starts on the preferred port when it is free, on 127.0.0.1 only', async () => {
    const free = await occupiedPort();
    await cleanups.pop()!();
    const server = await embedded(free);
    expect(server.port).toBe(free);
    expect(server.url).toBe(`http://127.0.0.1:${free}`);
    expect(server.onOtherPort).toBe(false);
    expect(await (await fetch(`${server.url}/api/health`)).json()).toEqual({ ok: true });
  });

  it('starts on another port when another program answers on the preferred one', async () => {
    const taken = await occupiedPort();
    expect(await portAnswers(taken)).toBe(true);
    const server = await embedded(taken);
    expect(server.port).not.toBe(taken);
    expect(server.onOtherPort).toBe(true);
    expect((await fetch(`${server.url}/api/health`)).ok).toBe(true);
  });

  it('prefers the port it fell back to last time', async () => {
    const taken = await occupiedPort();
    const remembered = await occupiedPort();
    await cleanups.pop()!();
    const server = await embedded(taken, remembered);
    expect(server.port).toBe(remembered);
  });

  it('restarts on the same port with new settings and keeps its token and boards', async () => {
    const server = await embedded(0);
    const { url, token } = server.access();
    const call = (name: string, args: Record<string, unknown>) =>
      fetch(`${url}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }).then(async (response) => ((await response.json()) as { result: { content: Array<{ text: string }> } }).result.content[0]!.text);
    await call('create_board', { name: 'Kept', key: 'KEPT' });
    await server.apply({ ...NO_SETTINGS, looseleaf: { url: 'http://127.0.0.1:9', token: 'l' } });
    expect(server.access()).toEqual({ url, token });
    expect(server.state()).toEqual({ url, upstream: null, looseleaf: { url: 'http://127.0.0.1:9' } });
    expect(await call('list_boards', {})).toContain('KEPT');
  });

  it('reports the server to sync with and whether the link is up', async () => {
    const home = await embedded(0);
    const laptop = await embedded(0);
    await laptop.apply({ ...NO_SETTINGS, upstream: home.access() });
    const deadline = Date.now() + 10_000;
    while (!laptop.state().upstream?.connected && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(laptop.state().upstream).toEqual({ url: home.url, connected: true, tokenRefused: false });
  });

  it('answers no when nothing listens on a port', async () => {
    const port = await occupiedPort();
    await cleanups.pop()!();
    expect(await portAnswers(port)).toBe(false);
  });

  it('comes back with the settings that last worked when new ones cannot be started', async () => {
    const broken = { url: 'http://127.0.0.1:1', token: 'refuse-me' };
    const server = new EmbeddedServer({
      dataDir: await dataDir(),
      webDir: null,
      preferredPort: 0,
      start: (options) => (options.upstream?.token === broken.token ? Promise.reject(new Error('the disk is full')) : startServer(options)),
    });
    await server.start(NO_SETTINGS);
    cleanups.push(() => server.close());
    const port = server.port;
    await expect(server.apply({ ...NO_SETTINGS, upstream: broken })).rejects.toThrow('the disk is full');
    expect(server.isRunning).toBe(true);
    expect(server.port).toBe(port);
    expect(server.state().upstream).toBeNull();
    expect(await (await fetch(`${server.url}/api/health`)).json()).toEqual({ ok: true });
  });
});
