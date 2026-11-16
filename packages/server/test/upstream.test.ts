import { describe, it } from 'vitest';
import * as Y from 'yjs';
import { WORKSPACE_DOC_ID, boardDocId, createCard, listBoards, readBoard } from '@corkboard/model';
import { blobHash } from '@corkboard/sync';
import { TOKEN, TestServer, connectedClient, expect, waitFor } from './harness.js';

const RETRY = { min: 10, max: 80 };

async function call(server: TestServer, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const response = await fetch(`${server.url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const reply = (await response.json()) as { result: { content: Array<{ text: string }> } };
  return reply.result.content[0]!.text;
}

/** A homelab server and a laptop server that follows it. */
async function pair(): Promise<{ home: TestServer; laptop: TestServer }> {
  const home = await TestServer.start();
  const laptop = await TestServer.start({ upstream: { url: home.url, token: TOKEN }, upstreamRetryMs: RETRY });
  await waitFor(() => laptop.current.upstream!.connected, 'the laptop to reach the homelab server');
  return { home, laptop };
}

async function sameDocs(a: TestServer, b: TestServer): Promise<boolean> {
  const ids = [...new Set([...(await a.current.store.listDocs()), ...(await b.current.store.listDocs())])];
  if (ids.length === 0) return false;
  for (const id of ids) {
    const [left, right] = [await a.storedDoc(id), await b.storedDoc(id)];
    if (Buffer.compare(Y.encodeStateAsUpdate(left), Y.encodeStateAsUpdate(right)) !== 0) return false;
  }
  return true;
}

describe('a server with an upstream', () => {
  it('sends what it had before the link existed, and follows changes both ways', async () => {
    const home = await TestServer.start();
    const laptop = await TestServer.start();
    await call(laptop, 'create_board', { name: 'Tried out locally', key: 'LOC' });
    await call(laptop, 'create_card', { title: 'Made before the link' });
    await laptop.stop();

    const linked = await TestServer.start({ dataDir: laptop.dataDir, upstream: { url: home.url, token: TOKEN }, upstreamRetryMs: RETRY });
    await waitFor(async () => (await call(home, 'get_board')).includes('LOC-1 Made before the link'), 'the earlier card on the homelab server');

    await call(home, 'create_card', { title: 'Made at home' });
    await waitFor(async () => (await call(linked, 'get_board')).includes('LOC-2 Made at home'), 'the homelab card on the laptop');
    await call(linked, 'move_card', { card: 'LOC-2', status: 'done' });
    await waitFor(async () => (await call(home, 'get_card', { card: 'LOC-2' })).includes('- Status: Done (done)'), 'the move on the homelab server');
    await waitFor(() => sameDocs(home, linked), 'both servers to store the same docs');
  });

  it('relays between a browser on the laptop and a browser at home', async () => {
    const { home, laptop } = await pair();
    await call(laptop, 'create_board', { name: 'Main', key: 'MAIN' });
    const onLaptop = await connectedClient(laptop);
    const atHome = await connectedClient(home);
    const entry = listBoards(await onLaptop.client.openDoc(WORKSPACE_DOC_ID))[0]!;
    const laptopDoc = await onLaptop.client.openDoc(boardDocId(entry.id));
    await waitFor(async () => (await home.current.boards.list()).length === 1, 'the board on the homelab server');
    const homeDoc = await atHome.client.openDoc(boardDocId(entry.id));
    await waitFor(() => readBoard(homeDoc).statuses.length === 5, 'the statuses in the browser at home');

    createCard(laptopDoc, { title: 'Typed on the laptop', by: 'Sam' });
    await waitFor(() => readBoard(homeDoc).cards.some((card) => card.title === 'Typed on the laptop'), 'the laptop card in the browser at home');
    createCard(homeDoc, { title: 'Typed at home', by: 'Sam' });
    await waitFor(() => readBoard(laptopDoc).cards.some((card) => card.title === 'Typed at home'), 'the home card in the browser on the laptop');
  });

  it('exchanges what each side changed while the upstream was down', async () => {
    const { home, laptop } = await pair();
    await call(laptop, 'create_board', { name: 'Main', key: 'MAIN' });
    await waitFor(async () => (await home.current.boards.list()).length === 1, 'the board on the homelab server');
    await home.stop();
    await waitFor(() => !laptop.current.upstream!.connected, 'the laptop to notice the homelab server is gone');
    await call(laptop, 'create_card', { title: 'Made while home was down' });
    await home.startAgain();
    await waitFor(async () => (await call(home, 'get_board')).includes('MAIN-1 Made while home was down'), 'the card on the homelab server after it came back');
    await waitFor(() => sameDocs(home, laptop), 'both servers to store the same docs');
  });

  it('gives cards made on each side while apart numbers of their own, the same on both', async () => {
    const { home, laptop } = await pair();
    await call(laptop, 'create_board', { name: 'Main', key: 'MAIN' });
    await waitFor(async () => (await home.current.boards.list()).length === 1, 'the board on the homelab server');
    await laptop.stop();
    await call(home, 'create_card', { title: 'Made at home' });
    const offline = await TestServer.start({ dataDir: laptop.dataDir });
    await call(offline, 'create_card', { title: 'Made on the laptop' });
    await offline.stop();
    await laptop.startAgain();

    const numbers = async (server: TestServer) => {
      const entry = (await server.current.boards.list())[0]!;
      return Object.fromEntries(readBoard(await server.storedDoc(boardDocId(entry.id))).cards.map((card) => [card.title, card.number]));
    };
    await waitFor(async () => Object.keys(await numbers(home)).length === 2 && (await sameDocs(home, laptop)), 'both cards on both servers');
    expect(Object.values(await numbers(home)).sort()).toEqual([1, 2]);
    expect(await numbers(laptop)).toEqual(await numbers(home));
  });

  it('copies blobs both ways', async () => {
    const { home, laptop } = await pair();
    const put = async (server: TestServer, text: string) => {
      const bytes = new TextEncoder().encode(text);
      const hash = blobHash(bytes);
      const response = await fetch(`${server.url}/api/blobs/${hash}`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: bytes });
      expect(response.status).toBe(201);
      return hash;
    };
    const fromLaptop = await put(laptop, 'attached on the laptop');
    const fromHome = await put(home, 'attached at home');
    // A doc change is what makes the link compare blobs again.
    await call(laptop, 'create_board', { name: 'Main' });
    await waitFor(() => home.current.store.hasBlob(fromLaptop), 'the laptop blob on the homelab server', 15_000);
    await waitFor(() => laptop.current.store.hasBlob(fromHome), 'the homelab blob on the laptop', 15_000);
  });
});
