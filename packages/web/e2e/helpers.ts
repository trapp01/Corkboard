/** Steps several tests share: first run, making a board, finding a status column, and calling an MCP tool the way an agent does. */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { TOKEN } from './server.js';

export const SHOTS = process.env.CORKBOARD_SHOTS ?? '';

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** First run with the token and a name, ending on the synced app. */
export async function firstRun(page: Page, url: string, name = 'Robin'): Promise<void> {
  await page.goto(url);
  await expect(page.getByText('Enter the access token for this server.')).toBeVisible();
  await page.getByLabel('Access token').fill(TOKEN);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Open the boards' }).click();
  await expect(page.locator('.sync-status[data-state="synced"]')).toBeVisible();
}

/** Makes a board from the empty state or the board switcher and waits for its statuses. */
export async function newBoard(page: Page, name: string, key?: string): Promise<void> {
  const create = page.getByRole('button', { name: 'Create a board' });
  if (await create.isVisible()) await create.click();
  else {
    await page.locator('.board-switcher').click();
    await page.getByRole('button', { name: 'New board…' }).click();
  }
  await page.getByLabel('Name', { exact: true }).fill(name);
  if (key) await page.getByLabel('Key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Create board' }).click();
  await expect(page.locator('.board-switcher-name')).toHaveText(name);
  await expect(status(page, 'Backlog')).toBeVisible();
}

/** A status column by its name. */
export function status(page: Page, name: string) {
  return page.locator('section.status-column', { has: page.locator('.status-name', { hasText: new RegExp(`^${name}$`) }) });
}

/** A card front by its title. */
export function card(page: Page, title: string) {
  return page.locator('.card-front', { hasText: title });
}

/** Adds cards to a status through its composer, one Enter each, and closes the composer. */
export async function addCards(page: Page, statusName: string, titles: string[]): Promise<void> {
  const column = status(page, statusName);
  await column.getByRole('button', { name: 'Add a card' }).click();
  const field = column.getByLabel('Card title');
  for (const title of titles) {
    await field.fill(title);
    await field.press('Enter');
    await expect(card(page, title)).toBeVisible();
  }
  await field.press('Escape');
}

/** Calls an MCP tool on the server as an agent would, and returns the text of its result. */
export async function callTool(request: APIRequestContext, url: string, name: string, args: Record<string, unknown>): Promise<string> {
  const response = await request.post(`${url}/mcp`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message: string } };
  if (body.error) throw new Error(`${name} failed: ${body.error.message}`);
  const text = body.result?.content?.map((part) => part.text ?? '').join('\n') ?? '';
  if (body.result?.isError) throw new Error(`${name} failed: ${text}`);
  return text;
}
