/**
 * Launches the built app on a free port with a temporary profile and drives
 * the real web client in its window: the bridge is there and Node is not,
 * first run asks only for the name and reaches "synced" with the app's own
 * server, a card an agent makes through the app's MCP endpoint shows up,
 * Connect an assistant names the app's address, the app refuses itself as a
 * server to sync with, and saving a second server (started here, in this
 * process) restarts the app's server, after which the window reconnects and
 * the two servers converge. Run with `pnpm --filter @corkboard/desktop smoke`
 * (it builds first). Needs a desktop session and a built web client.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { startServer, type RunningServer } from '@corkboard/server';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = createRequire(import.meta.url)('electron') as string;
const HOME_TOKEN = 'smoke-home-token';
const WAIT_MS = 20_000;

const results: Array<[string, boolean, unknown]> = [];
function check(name: string, ok: boolean, detail: unknown = ''): void {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}

async function waitFor(what: string, test: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await test().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(`      gave up waiting for ${what}`);
  return false;
}

async function callTool(url: string, token: string, name: string, args: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const reply = (await response.json()) as { result?: { content?: Array<{ text?: string }> } };
  return reply.result?.content?.map((part) => part.text ?? '').join('\n') ?? '';
}

const syncLabel = (page: Page) => page.locator('.sync-status').getAttribute('aria-label');
const syncState = (page: Page) => page.locator('.sync-status').getAttribute('data-state');
const cardShown = (page: Page, title: string) => page.locator('.card-front', { hasText: title }).isVisible();

async function openFromMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function run(app: ElectronApplication, home: RunningServer, userDataDir: string, output: () => string): Promise<void> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const origin = new URL(page.url()).origin;
  check('the window shows the app server’s page on 127.0.0.1, not on 8422 here', /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && !origin.endsWith(':8422'), origin);

  const globals = await page.evaluate(`({
    kind: window.corkboardShell && window.corkboardShell.kind,
    platform: window.corkboardShell && window.corkboardShell.platform,
    node: [typeof require, typeof process, typeof module, typeof Buffer].join(','),
  })`);
  const g = globals as { kind: string; platform: string; node: string };
  check("window.corkboardShell is the desktop bridge", g.kind === 'desktop', g);
  check('no Node globals in the page', g.node === 'undefined,undefined,undefined,undefined', g.node);

  await page.getByText('Where should your boards sync?').waitFor({ timeout: WAIT_MS });
  check('first run asks where boards sync, not for a token', (await page.getByLabel('Access token').count()) === 0);
  await page.getByRole('button', { name: /Keep boards on this computer only/ }).click();
  await page.getByLabel('Your name').fill('Smoke');
  await page.getByRole('button', { name: 'Continue' }).click();
  check(
    'after the name, the window is synced with the app’s server and on this computer only',
    await waitFor('synced', async () => (await syncState(page)) === 'synced' && (await syncLabel(page)) === 'Sync: On this computer'),
    await syncLabel(page),
  );

  const token = (await readFile(join(userDataDir, 'data', 'token'), 'utf8')).trim();
  await callTool(origin, token, 'create_board', { name: 'Smoke', key: 'SMK' });
  await callTool(origin, token, 'create_card', { title: 'Made by an agent' });
  check('a card made through the app’s MCP endpoint shows in the window', await waitFor('the agent card', () => cardShown(page, 'Made by an agent')));

  await openFromMenu(page, 'Connect an assistant');
  const dialog = page.getByRole('dialog', { name: 'Connect an assistant' });
  check('Connect an assistant names this run’s MCP address', (await dialog.innerText()).includes(`${origin}/mcp`), `${origin}/mcp`);
  await page.keyboard.press('Escape');

  await openFromMenu(page, 'Settings');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  check(
    'Settings says boards are on this computer only',
    await waitFor('the Sync section', () => settings.getByText('Boards are kept on this computer only. Connecting uploads').isVisible()),
  );
  await settings.getByRole('button', { name: 'Connect to a server' }).click();
  await settings.getByLabel('Server address').fill(origin);
  await settings.getByLabel('Access token').fill(token);
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  check(
    'the app refuses its own address as the server to sync with',
    await waitFor('the refusal', () => settings.getByText('That is this app’s own address.').isVisible()),
  );

  await settings.getByLabel('Server address').fill(home.url);
  await settings.getByLabel('Access token').fill('not-the-token');
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  check(
    'a wrong token for the server to sync with is refused before saving',
    await waitFor('the token message', () => settings.getByText('The server refused this access token.').isVisible()),
  );

  await settings.getByLabel('Access token').fill(HOME_TOKEN);
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  check(
    'saving the server to sync with shows it in Settings',
    await waitFor('the saved server', () => settings.getByText(`Syncing with ${home.url}.`).isVisible()),
  );
  check(
    'the window reconnects to the restarted server and reads Connected with the link up',
    await waitFor('Connected', async () => (await syncState(page)) === 'synced' && (await syncLabel(page)) === 'Sync: Connected'),
    await syncLabel(page),
  );
  check(
    'the agent’s card reaches the server to sync with',
    await waitFor('the card on the second server', async () => (await callTool(home.url, HOME_TOKEN, 'get_board', { board: 'SMK' })).includes('SMK-1 Made by an agent')),
  );
  await callTool(home.url, HOME_TOKEN, 'create_card', { board: 'SMK', title: 'Made on the other server' });
  check('a card made on the other server shows in the window', await waitFor('the other card', () => cardShown(page, 'Made on the other server')));
  await callTool(origin, token, 'create_card', { title: 'Made after the restart' });
  check('a card an agent makes after the restart shows in the window', await waitFor('the card after the restart', () => cardShown(page, 'Made after the restart')));
  check(
    'the two servers converge on the same board',
    await waitFor('the same board on both', async () => {
      // Card addresses in the text name the server asked, so only the cards are compared.
      const cards = async (url: string, key: string) =>
        ((await callTool(url, key, 'get_board', { board: 'SMK' })).match(/SMK-\d+ [^\n(]*/g) ?? []).sort().join('|');
      const here = await cards(origin, token);
      return here.includes('Made after the restart') && here.includes('Made on the other server') && here === (await cards(home.url, HOME_TOKEN));
    }),
  );
  check('the token never appears in the window’s address or the app’s output', !page.url().includes(token) && !output().includes(token));
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'corkboard-smoke-'));
  const userDataDir = join(root, 'user-data');
  const home = await startServer({ dataDir: join(root, 'home'), port: 0, host: '127.0.0.1', token: HOME_TOKEN });
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CORKBOARD_USER_DATA_DIR: userDataDir, CORKBOARD_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: electronPath, args: [packageDir], env, timeout: 60_000 });
  let output = '';
  app.process().stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  app.process().stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  try {
    await run(app, home, userDataDir, () => output);
  } catch (error) {
    check('the smoke run finished', false, String(error));
  } finally {
    const child = app.process();
    const exited =
      child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
    await app.close();
    const code = await exited;
    check('the app quits cleanly, closing its server first', code === 0, `exit code ${code}`);
    await home.close();
    await rm(root, { recursive: true, force: true });
  }
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nsmoke passed: ${results.length} checks` : `\nsmoke failed: ${failed} of ${results.length} checks\n\napp output:\n${output}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
