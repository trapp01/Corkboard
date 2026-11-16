/**
 * Screenshots of a demo board for reviewing the look and for the README,
 * written to $CORKBOARD_SHOTS (docs/screenshots in the repo). Skipped unless
 * that is set; it asserts nothing beyond the steps working. Most cards arrive
 * the way an agent's do, through MCP.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { callTool, card, firstRun, SHOTS } from './helpers.js';
import { TestServer } from './server.js';

test.skip(!SHOTS, 'set CORKBOARD_SHOTS to a folder to take screenshots');

let server: TestServer;
test.beforeAll(async () => {
  server = await TestServer.create();
});
test.afterAll(async () => {
  await server.dispose();
});

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), animations: 'disabled' });

function day(offset: number): string {
  const date = new Date(Date.now() + offset * 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function seed(request: APIRequestContext, url: string): Promise<void> {
  const tool = (name: string, args: Record<string, unknown>) => callTool(request, url, name, args);
  for (const [name, color] of [
    ['Web', 'blue'],
    ['iOS', 'purple'],
    ['API', 'teal'],
    ['Bug', 'red'],
    ['Docs', 'yellow'],
  ] as const) {
    await tool('create_label', { board: 'WEB', name, color });
  }
  const cards: Array<Record<string, unknown>> = [
    { title: 'Remember the last sort order on the orders table', labels: ['Web'], status: 'Backlog' },
    { title: 'Export invoices as CSV', labels: ['Web', 'API'], status: 'Backlog', description: 'Finance asked for a monthly export.' },
    { title: 'Write the self-hosting guide', labels: ['Docs'], status: 'Backlog', checklist: ['Docker', 'Reverse proxy', 'Backups'] },
    { title: 'Push notifications for shipped orders', labels: ['iOS'], status: 'This week', due: day(3) },
    { title: 'Rate-limit the public search endpoint', labels: ['API'], status: 'This week', due: day(-1) },
    {
      title: 'Session expires while the checkout form is open',
      labels: ['Web', 'Bug'],
      status: 'In progress',
      description: 'Users lose the cart after 30 minutes idle on the payment step.',
      checklist: ['Reproduce on staging', 'Refresh the token in the background', 'Add a test for the idle case'],
      links: [{ target: 'https://example.com/pulls/412', title: 'Pull request 412' }],
    },
    { title: 'Move image resizing to a background job', labels: ['API'], status: 'In progress', checklist: ['Queue the job', 'Serve a placeholder'] },
    { title: 'App Store screenshots for 2.4', labels: ['iOS'], status: 'Blocked', description: 'Waiting on the final copy.' },
    { title: 'Upgrade the date picker', labels: ['Web'], status: 'Done' },
    { title: 'Fix the crash when the camera permission is denied', labels: ['iOS', 'Bug'], status: 'Done', checklist: ['Handle denial', 'Show settings link'] },
  ];
  for (const input of cards) await tool('create_card', { board: 'WEB', author: 'Planning agent', ...input });
  await tool('update_checklist', { card: 'WEB-6', check: ['Reproduce on staging'] });
  await tool('update_checklist', { card: 'WEB-10', check: ['Handle denial', 'Show settings link'] });
  await tool('update_checklist', { card: 'WEB-7', check: ['Queue the job'] });
  await tool('add_comment', { card: 'WEB-6', body: 'Reproduced: the token refresh never runs while the tab is in the background.', author: 'Planning agent' });
  await tool('add_comment', { card: 'WEB-6', body: 'I can pair on the test this afternoon.', author: 'Sam' });
  await tool('add_comment', { card: 'WEB-8', body: 'Copy is due Thursday.', author: 'Robin' });
}

test('demo board on desktop, dark and phone', async ({ page, browser, request }) => {
  await firstRun(page, server.url, 'Robin');
  await page.getByRole('button', { name: 'Create a board' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Web app');
  await page.getByLabel('Key', { exact: true }).fill('WEB');
  await page.getByRole('radio', { name: 'Teal' }).click();
  await page.getByRole('button', { name: 'Create board' }).click();
  await expect(page.locator('.status-column')).toHaveCount(5);
  await seed(request, server.url);
  await expect(card(page, 'Upgrade the date picker')).toBeVisible();
  await page.waitForTimeout(1800);
  await shot(page, 'desktop');


  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const darkPage = await dark.newPage();
  await firstRun(darkPage, server.url, 'Sam');
  await expect(card(darkPage, 'Upgrade the date picker')).toBeVisible();
  await darkPage.waitForTimeout(1800);
  await shot(darkPage, 'desktop-dark');
  await dark.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const phonePage = await phone.newPage();
  await firstRun(phonePage, server.url, 'Robin');
  await expect(card(phonePage, 'Export invoices as CSV')).toBeVisible();
  await phonePage.waitForTimeout(1800);
  await shot(phonePage, 'phone');
  await phone.close();
});
