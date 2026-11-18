import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WORKSPACE_DOC_ID, boardDocId, cardsInStatus, createCard, listBoards, moveCard, readBoard, updateCard } from '@corkboard/model';
import { MCP_TOOLS } from '../src/mcp-tools.js';
import { TOKEN, TestServer, connectedClient, editDoc, expect, waitFor, waitForConvergence } from './harness.js';

interface ToolAnswer {
  text: string;
  isError: boolean;
}

async function rpc(server: TestServer, body: unknown, token: string | null = TOKEN): Promise<Response> {
  return fetch(`${server.url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
}

async function call(server: TestServer, name: string, args: Record<string, unknown> = {}): Promise<ToolAnswer> {
  const response = await rpc(server, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const reply = (await response.json()) as { result?: { content: Array<{ text: string }>; isError?: boolean }; error?: { message: string } };
  if (reply.result === undefined) throw new Error(`tools/call ${name} answered an error: ${reply.error?.message}`);
  return { text: reply.result.content[0]!.text, isError: reply.result.isError === true };
}

/** A server with one board, MAIN, holding the labels iOS and Web. */
async function serverWithBoard(options: Parameters<typeof TestServer.start>[0] = {}): Promise<TestServer> {
  const server = await TestServer.start(options);
  expect((await call(server, 'create_board', { name: 'Main board', key: 'main' })).text).toContain('with the key MAIN');
  await call(server, 'create_label', { name: 'iOS', color: 'blue' });
  await call(server, 'create_label', { name: 'Web' });
  return server;
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('the MCP endpoint', () => {
  it('speaks to the MCP SDK client: instructions, the tool list and a call', async () => {
    const server = await serverWithBoard();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }),
    );
    closers.push(() => client.close());
    expect(client.getInstructions()).toContain('move_card');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(MCP_TOOLS.map((tool) => tool.name));
    expect(tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name)).toEqual(['list_boards', 'get_board', 'search_cards', 'get_card']);
    const listed = await client.callTool({ name: 'list_boards', arguments: {} });
    expect((listed.content as Array<{ text: string }>)[0]!.text).toContain('## Main board (MAIN)');
  });

  it('refuses a call without the token and anything but POST', async () => {
    const server = await TestServer.start();
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    expect((await rpc(server, body, null)).status).toBe(401);
    expect((await rpc(server, body, 'wrong')).status).toBe(401);
    expect((await fetch(`${server.url}/mcp`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(405);
  });

  it('carries a task from a new card to done, the way the instructions ask', async () => {
    const server = await serverWithBoard();
    const created = await call(server, 'create_card', {
      title: 'Login loop on iOS',
      description: 'Token refresh fails after a day.',
      labels: ['ios'],
      due: '2030-01-05',
      checklist: ['Reproduce', 'Fix', 'Ship'],
      links: [{ target: 'https://example.com/pr/4', title: 'Pull request' }],
      author: 'Claude',
    });
    expect(created.text).toBe(`Created MAIN-1 "Login loop on iOS" in Backlog.\nAddress: ${server.url}/c/MAIN-1\n`);

    expect((await call(server, 'move_card', { card: 'MAIN-1', status: 'doing', author: 'Claude' })).text).toBe('Moved MAIN-1 "Login loop on iOS" to In progress (doing).\n');
    expect((await call(server, 'update_checklist', { card: 'main-1', check: ['reproduce'], add: ['Tell support'] })).text).toContain('is now 1/4 done');
    await call(server, 'add_comment', { card: `${server.url}/c/MAIN-1`, body: 'Reproduced on a test phone.', author: 'Claude' });
    await call(server, 'update_card', { card: 'MAIN-1', append_description: 'Android is out of scope.', add_labels: ['Web'], remove_labels: ['iOS'] });
    await call(server, 'add_link', { card: 'MAIN-1', target: 'looseleaf:pg1', title: 'Scope notes' });

    const card = (await call(server, 'get_card', { card: 'MAIN-1' })).text;
    expect(card).toContain('# MAIN-1 Login loop on iOS');
    expect(card).toContain('- Status: In progress (doing)');
    expect(card).toContain('- Labels: Web');
    expect(card).toContain('- Due: 2030-01-05');
    expect(card).toContain('Token refresh fails after a day.\n\nAndroid is out of scope.');
    expect(card).toContain('## Checklist (1/4)');
    expect(card).toMatch(/- \[x\] Reproduce \(item [\w-]+\)/);
    expect(card).toContain('- Scope notes — Looseleaf page pg1');
    expect(card).toContain('### Claude, ');
    expect(card).toContain('Claude moved it from Backlog to In progress');

    await call(server, 'move_card', { card: 'MAIN-1', status: 'Done' });
    const board = (await call(server, 'get_board', { status: 'done' })).text;
    expect(board).toContain('## Done (done, 1 card)');
    expect(board).toContain('- MAIN-1 Login loop on iOS · [Web] · due 2030-01-05 · checklist 1/4 · 1 comment');
    expect(board).not.toContain('## Backlog');

    await call(server, 'create_card', { title: 'Still to do' });
    const done = (await call(server, 'get_board', { status: 'Done' })).text;
    expect(done).toContain('## Done (done, 1 card)');
    expect(done).not.toContain('Still to do');

    const byId = /- Id: ([\w-]+)/.exec(card)![1]!;
    expect((await call(server, 'get_card', { card: byId })).text).toContain('# MAIN-1 Login loop on iOS');
  });

  it('places cards by place and by position, and leaves an archived card where it is until it is restored', async () => {
    const server = await serverWithBoard();
    for (const title of ['A', 'B', 'C']) await call(server, 'create_card', { title });
    await call(server, 'create_card', { title: 'First', place: 'top' });
    await call(server, 'move_card', { card: 'MAIN-1', status: 'Backlog', position: 2 });
    const titles = async () => {
      const entry = (await server.current.boards.list())[0]!;
      const board = readBoard(await server.storedDoc(boardDocId(entry.id)));
      return cardsInStatus(board, board.statuses[0]!.id).map((card) => card.title);
    };
    expect(await titles()).toEqual(['First', 'A', 'C', 'B']);
    expect((await call(server, 'archive_card', { card: 'MAIN-1' })).text).toBe('Archived MAIN-1 "A".\n');
    expect(await titles()).toEqual(['First', 'C', 'B']);
    const refused = await call(server, 'move_card', { card: 'MAIN-1', status: 'Backlog', place: 'top' });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe('MAIN-1 "A" is archived. Restore it with archive_card and restore: true, then move it.');
    expect((await call(server, 'archive_card', { card: 'MAIN-1', restore: true })).text).toBe('Restored MAIN-1 "A".\n');
    await call(server, 'move_card', { card: 'MAIN-1', status: 'Backlog', place: 'top' });
    expect(await titles()).toEqual(['A', 'First', 'C', 'B']);
  });

  it('searches across boards with filters', async () => {
    const server = await serverWithBoard();
    await call(server, 'create_board', { name: 'Home' });
    await call(server, 'create_card', { board: 'MAIN', title: 'Fix login', labels: ['iOS'], status: 'doing' });
    await call(server, 'create_card', { board: 'MAIN', title: 'Export earnings', description: 'Mention the login page' });
    await call(server, 'create_card', { board: 'Home', title: 'Renew login for the bank', due: '2030-02-01' });

    const all = (await call(server, 'search_cards', { query: 'login' })).text;
    expect(all).toContain('3 matching cards.');
    expect(all).toContain('- MAIN-1 Fix login · [iOS] — In progress');
    expect(all).toContain('- HOM-1 Renew login for the bank · due 2030-02-01 — Backlog');
    expect((await call(server, 'search_cards', { query: 'login', board: 'main', status: 'doing' })).text).toContain('1 matching card.');
    expect((await call(server, 'search_cards', { label: 'ios' })).text).toContain('1 matching card.');
    expect((await call(server, 'search_cards', { due_by: '2030-12-31' })).text).toContain('HOM-1');
    expect((await call(server, 'search_cards', { query: 'login', limit: 1 })).text).toContain('Showing 1 of 3 matching cards.');
    expect((await call(server, 'search_cards', { query: 'nothing-like-this' })).text).toContain('No cards match');
  });

  it('answers a mistake the caller can fix with what to do next', async () => {
    const server = await serverWithBoard();
    await call(server, 'create_card', { title: 'A' });
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['get_card', { card: 'MAIN-99' }, 'Main board has no card MAIN-99'],
      ['get_card', { card: 'ZZZ-1' }, 'No board has the key ZZZ. The boards are: Main board (MAIN).'],
      ['get_card', { card: 'the login one' }, 'is not a card ref such as WEB-12'],
      ['move_card', { card: 'MAIN-1', status: 'Shipping' }, "This board's statuses are: Backlog (todo), This week (todo), In progress (doing), Blocked (doing), Done (done)."],
      ['create_card', { title: 'B', labels: ['Android'] }, "This board's labels are: iOS, Web. Add one with create_label."],
      ['create_card', { title: 'B', due: 'tomorrow' }, 'Write a day as YYYY-MM-DD'],
      ['create_card', { title: 'B', due: '2030-02-31' }, '"2030-02-31" is not a day'],
      ['search_cards', { due_by: 'next week' }, '"next week" is not a day'],
      ['get_card', { card: 'MAIN-1', constructor: 'x' }, 'get_card has no argument "constructor"'],
      ['create_card', { title: '  ' }, 'needs a title that is not empty'],
      ['create_card', {}, 'create_card needs "title"'],
      ['create_card', { title: 'B', colour: 'red' }, 'create_card has no argument "colour"'],
      ['create_card', { title: 'B', place: 'middle' }, '"place" must be one of: top, bottom.'],
      ['create_card', { title: 'B', links: [{ target: 'ftp://x' , title: 'x' }] }, 'is not a link target'],
      ['create_card', { title: 'B', links: [{ target: 'https://x' }] }, '"links[0]" needs "title"'],
      ['update_checklist', { card: 'MAIN-1', check: ['Nope'] }, 'The card has no checklist item "Nope"'],
      ['create_status', { name: 'done', kind: 'done' }, 'already has a status called "done"'],
      ['create_label', { name: 'ios' }, 'already has a label called "ios"'],
      ['get_board', { board: 'Nope' }, 'No board is called "Nope"'],
    ];
    for (const [name, args, message] of cases) {
      const answer = await call(server, name, args);
      expect(answer.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(answer.text).toContain(message);
    }
    const entry = (await server.current.boards.list())[0]!;
    expect(readBoard(await server.storedDoc(boardDocId(entry.id))).cards).toHaveLength(1);
  });

  it('asks which board when there are several, and needs none named when there is one', async () => {
    const server = await TestServer.start();
    expect((await call(server, 'create_card', { title: 'A' })).text).toContain('There are no boards yet');
    await call(server, 'create_board', { name: 'Work' });
    expect((await call(server, 'create_card', { title: 'A' })).isError).toBe(false);
    await call(server, 'create_board', { name: 'Home' });
    expect((await call(server, 'create_card', { title: 'B' })).text).toBe('Say which board: Work (WOR), Home (HOM).');
  });

  it('adds a status where asked', async () => {
    const server = await serverWithBoard();
    const answer = await call(server, 'create_status', { name: 'In review', kind: 'doing', position: 4 });
    expect(answer.text).toBe('Added the status In review to Main board. Its statuses are now: Backlog → This week → In progress → In review → Blocked → Done.\n');
  });
});

describe('agents and replicas together', () => {
  it('shows a connected replica what an agent changed, and an agent what a replica changed', async () => {
    const server = await serverWithBoard();
    const { client } = await connectedClient(server);
    const workspace = await client.openDoc(WORKSPACE_DOC_ID);
    const entry = listBoards(workspace)[0]!;
    const doc = await client.openDoc(boardDocId(entry.id));
    await call(server, 'create_card', { title: 'From the agent' });
    await waitFor(() => readBoard(doc).cards.some((card) => card.title === 'From the agent'), 'the agent card on the replica');

    createCard(doc, { title: 'From the browser', by: 'Sam' });
    await waitFor(async () => (await call(server, 'get_board')).text.includes('MAIN-2 From the browser'), 'the browser card on the server');
  });

  it('keeps an agent edit and an offline replica edit to one card, byte for byte', async () => {
    const server = await serverWithBoard();
    await call(server, 'create_card', { title: 'Shared', description: 'first line\nlast line' });
    const entry = (await server.current.boards.list())[0]!;
    const docId = boardDocId(entry.id);
    const replica = await connectedClient(server);
    const doc = await replica.client.openDoc(docId);
    await waitFor(() => readBoard(doc).cards.length === 1, 'the card on the replica');
    const cardId = readBoard(doc).cards[0]!.id;
    replica.control.cutAll();
    replica.client.disconnect();

    updateCard(doc, cardId, { description: 'FIRST line\nlast line' });
    moveCard(doc, cardId, { statusId: readBoard(doc).statuses[2]!.id }, 'Sam');
    await call(server, 'update_card', { card: 'MAIN-1', append_description: 'Added by the agent.' });
    await call(server, 'add_comment', { card: 'MAIN-1', body: 'Looked into it.' });
    await call(server, 'update_checklist', { card: 'MAIN-1', add: ['Check the logs'] });

    await replica.client.connect({ url: server.url, token: TOKEN });
    await waitForConvergence(server, [replica.store], [docId]);
    const card = readBoard(await server.storedDoc(docId)).cards[0]!;
    expect(card.description).toBe('FIRST line\nlast line\n\nAdded by the agent.');
    expect(card.statusId).toBe(readBoard(doc).statuses[2]!.id);
    expect(card.comments.map((comment) => comment.body)).toEqual(['Looked into it.']);
    expect(card.checklist.map((item) => item.text)).toEqual(['Check the logs']);
  });

  it('renumbers a card that two replicas numbered alike while apart', async () => {
    const server = await serverWithBoard();
    const entry = (await server.current.boards.list())[0]!;
    const docId = boardDocId(entry.id);
    const a = await connectedClient(server);
    const b = await connectedClient(server);
    await a.client.openDoc(docId);
    await b.client.openDoc(docId);
    a.control.cutAll();
    b.control.cutAll();
    a.client.disconnect();
    b.client.disconnect();
    await editDoc(a.client, docId, (doc) => createCard(doc, { title: 'From A', by: 'A' }));
    await editDoc(b.client, docId, (doc) => createCard(doc, { title: 'From B', by: 'B' }));
    await a.client.connect({ url: server.url, token: TOKEN });
    await b.client.connect({ url: server.url, token: TOKEN });
    const numbers = async () => readBoard(await server.storedDoc(docId)).cards.map((card) => card.number).sort();
    await waitFor(async () => JSON.stringify(await numbers()) === '[1,2]', 'two cards numbered 1 and 2 on the server');
    const onA = await a.client.openDoc(docId);
    await waitFor(() => JSON.stringify(readBoard(onA).cards.map((card) => card.number).sort()) === '[1,2]', 'the repair on replica A');
  });
});

describe('Looseleaf', () => {
  async function fakeLooseleaf(pages: Record<string, string>): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        if (req.headers.authorization !== 'Bearer notes-token') {
          res.writeHead(401).end();
          return;
        }
        const message = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; params: { arguments: { page_id: string } } };
        const text = pages[message.params.arguments.page_id];
        const result = text === undefined ? { content: [{ type: 'text', text: 'No page' }], isError: true } : { content: [{ type: 'text', text }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise((resolve) => server.close(() => resolve())));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
  }

  it('puts the text of a linked page into get_card and serves it to the web client', async () => {
    const notes = await fakeLooseleaf({ pg1: '# Scope\n\nOut of scope: Android.' });
    const server = await serverWithBoard({ looseleaf: { url: notes.url, token: 'notes-token' } });
    await call(server, 'create_card', { title: 'A', links: [{ target: 'looseleaf:pg1', title: 'Scope notes' }, { target: 'looseleaf:gone', title: 'Old notes' }] });
    const card = (await call(server, 'get_card', { card: 'MAIN-1' })).text;
    expect(card).toContain('- Scope notes — Looseleaf page pg1\n\n  > # Scope\n  > \n  > Out of scope: Android.');
    expect(card).toContain('- Old notes — Looseleaf page gone');

    const headers = { Authorization: `Bearer ${TOKEN}` };
    const page = await fetch(`${server.url}/api/looseleaf/pages/pg1`, { headers });
    expect(await page.json()).toEqual({ markdown: '# Scope\n\nOut of scope: Android.', address: `${notes.url}/#page=pg1` });

    // A server that reaches Looseleaf at an address a browser cannot use hands out the one people open.
    const composed = await serverWithBoard({ looseleaf: { url: notes.url, token: 'notes-token', linkUrl: 'http://nas:8421/' } });
    const linked = await fetch(`${composed.url}/api/looseleaf/pages/pg1`, { headers });
    expect(await linked.json()).toMatchObject({ address: 'http://nas:8421/#page=pg1' });
    expect((await fetch(`${server.url}/api/looseleaf/pages/gone`, { headers })).status).toBe(404);
    expect((await fetch(`${server.url}/api/looseleaf/pages/pg1`)).status).toBe(401);
    expect((await fetch(`${server.url}/api/looseleaf/pages/%E0`, { headers })).status).toBe(404);
  });

  it('leaves the text out when Looseleaf is away or not configured', async () => {
    const notes = await fakeLooseleaf({});
    const url = notes.url;
    await new Promise((resolve) => notes.server.close(resolve));
    const server = await serverWithBoard({ looseleaf: { url, token: 'notes-token' } });
    await call(server, 'create_card', { title: 'A', links: [{ target: 'looseleaf:pg1', title: 'Scope notes' }] });
    expect((await call(server, 'get_card', { card: 'MAIN-1' })).text).toContain('- Scope notes — Looseleaf page pg1');

    const plain = await TestServer.start();
    expect((await fetch(`${plain.url}/api/looseleaf/pages/pg1`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });
});
