import { expect, test } from '@playwright/test';
import { addCards, callTool, card, firstRun, mod, newBoard, status } from './helpers.js';
import { TestServer } from './server.js';

let server: TestServer;
test.beforeAll(async () => {
  server = await TestServer.create();
});
test.afterAll(async () => {
  await server.dispose();
});

test('first run, a board, a card worked on in its card back, a drag, a reload, and an agent changing the board live', async ({ page, request }) => {
  await firstRun(page, server.url);
  await expect(page.getByRole('heading', { name: 'No boards yet' })).toBeVisible();
  await newBoard(page, 'Web app');
  await expect(page).toHaveURL(/\/b\/WA$/);

  await addCards(page, 'Backlog', ['Set up CI', 'Write the README', 'Fix login timeout']);
  await expect(status(page, 'Backlog').locator('.card-front')).toHaveCount(3);

  // The card back: description, checklist, comment, then a move with the status select.
  await card(page, 'Set up CI').click();
  await expect(page).toHaveURL(/\/c\/WA-1$/);
  const back = page.getByRole('dialog', { name: /WA-1/ });
  await back.getByRole('button', { name: 'Add a description' }).click();
  await back.getByRole('textbox', { name: 'Description' }).fill('Run the **unit tests** on every push.');
  await back.getByRole('textbox', { name: 'Description' }).press(`${mod}+Enter`);
  await expect(back.locator('.description-view strong')).toHaveText('unit tests');

  await back.getByRole('button', { name: 'Add an item' }).click();
  const item = back.getByLabel('New checklist item');
  await item.fill('Pick a runner');
  await item.press('Enter');
  await item.fill('Cache dependencies');
  await item.press('Enter');
  await item.press('Escape');
  await back.getByRole('checkbox', { name: 'Pick a runner' }).check();
  await expect(back.locator('.section-count')).toHaveText('1 of 2');

  await back.getByLabel('Write a comment').fill('Started on this.');
  await back.getByLabel('Write a comment').press(`${mod}+Enter`);
  await expect(back.locator('.timeline-comment')).toContainText('Started on this.');
  await expect(back.locator('.timeline-comment .actor')).toHaveText('Robin');

  await back.getByLabel('Status').selectOption({ label: 'In progress' });
  await expect(back.locator('.timeline-activity').first()).toContainText('moved this card from Backlog to In progress');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/b\/WA$/);
  await expect(status(page, 'In progress').locator('.card-front', { hasText: 'Set up CI' })).toBeVisible();
  await expect(card(page, 'Set up CI').locator('.badge', { hasText: '1/2' })).toBeVisible();

  // A real drag: Backlog's "Fix login timeout" onto This week's empty space.
  const dragged = card(page, 'Fix login timeout');
  const from = await dragged.boundingBox();
  const target = await status(page, 'This week').locator('.status-cards').boundingBox();
  if (!from || !target) throw new Error('Card or status not laid out');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 15 });
  await page.mouse.move(target.x + target.width / 2, target.y + 12, { steps: 2 });
  await page.mouse.up();
  await expect(status(page, 'This week').locator('.card-front', { hasText: 'Fix login timeout' })).toBeVisible();
  await expect(status(page, 'Backlog').locator('.card-front')).toHaveCount(1);

  // Everything is still there after a reload. The client stores a change before it sends it, so once the server has the drop, so does this browser.
  await expect.poll(() => callTool(request, server.url, 'get_card', { card: 'WA-3' })).toMatch(/This week/);
  await page.reload();
  await expect(page.locator('.sync-status[data-state="synced"]')).toBeVisible();
  await expect(status(page, 'In progress').locator('.card-front', { hasText: 'Set up CI' })).toBeVisible();
  await expect(status(page, 'This week').locator('.card-front', { hasText: 'Fix login timeout' })).toBeVisible();
  await card(page, 'Set up CI').click();
  await expect(page.locator('.description-view strong')).toHaveText('unit tests');
  await expect(page.getByRole('checkbox', { name: 'Pick a runner' })).toBeChecked();
  await expect(page.locator('.timeline-comment')).toContainText('Started on this.');
  await page.keyboard.press('Escape');

  // An agent works through MCP; the board follows without a reload.
  const created = await callTool(request, server.url, 'create_card', { board: 'WA', title: 'Add a dark theme', author: 'Claude' });
  expect(created).toContain('WA-4');
  const agentCard = card(page, 'Add a dark theme');
  await expect(status(page, 'Backlog').locator('.card-front', { hasText: 'Add a dark theme' })).toBeVisible();
  await expect(agentCard).toHaveClass(/is-flashing/);
  await callTool(request, server.url, 'move_card', { card: 'WA-4', status: 'done', author: 'Claude' });
  await expect(status(page, 'Done').locator('.card-front', { hasText: 'Add a dark theme' })).toBeVisible();
  await expect(status(page, 'Backlog').locator('.card-front', { hasText: 'Add a dark theme' })).toHaveCount(0);
  await expect(agentCard.locator('.card-done-mark')).toBeVisible();
});

test('search and label filters, keyboard shortcuts, archive with undo', async ({ page }) => {
  await firstRun(page, server.url, 'Sam');
  await page.goto(`${server.url}/`);
  await newBoard(page, 'Mobile', 'MOB');
  await addCards(page, 'Backlog', ['Crash on launch', 'Offline banner', 'Push sign-up']);

  // A label made on one card's back, then filtered by.
  await card(page, 'Crash on launch').click();
  await page.getByRole('button', { name: 'Add labels' }).click();
  await page.getByLabel('New label').fill('iOS');
  await page.getByRole('button', { name: 'Create label' }).click();
  await expect(page.locator('.card-back-labels .label-chip')).toHaveText('iOS');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/b\/MOB$/);

  await page.keyboard.press('/');
  await expect(page.getByLabel('Search cards')).toBeFocused();
  await page.keyboard.type('offline');
  await expect(page.locator('.card-front')).toHaveCount(1);
  await expect(page.locator('.filter-count')).toHaveText('1 of 3 cards');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.card-front')).toHaveCount(3);

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('dialog', { name: 'Filter by label' }).getByRole('checkbox').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-front')).toHaveCount(1);
  await expect(page.locator('.drag-hint')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  // `n` opens the composer on the hovered status; hovering a card, `c` archives it and Undo brings it back.
  await status(page, 'This week').hover();
  await page.keyboard.press('n');
  await expect(status(page, 'This week').getByLabel('Card title')).toBeFocused();
  await page.keyboard.press('Escape');
  await card(page, 'Push sign-up').hover();
  await page.keyboard.press('c');
  await expect(card(page, 'Push sign-up')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'Push sign-up')).toBeVisible();

  await card(page, 'Offline banner').hover();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/c\/MOB-2$/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('card text written by someone else cannot dress itself up, call out, or be lost to an open editor', async ({ page, request }) => {
  await firstRun(page, server.url, 'Sam');
  await page.goto(`${server.url}/`);
  await newBoard(page, 'Safety', 'SAF');
  const hostile = [
    'Plain **bold** text.',
    '<div class="modal-backdrop" style="position:fixed;inset:0" id="overlay">Sign in again</div>',
    '![tracker](https://example.com/pixel.png)',
    '<img src="x" onerror="document.title=\'ran\'">',
    '[click](javascript:document.title=\'ran\')',
  ].join('\n\n');
  await callTool(request, server.url, 'create_card', { board: 'SAF', title: 'From an agent', description: hostile });
  await card(page, 'From an agent').click();
  const view = page.locator('.description-view');
  await expect(view.locator('strong')).toHaveText('bold');
  await expect(view.locator('img')).toHaveCount(0);
  await expect(view.locator('[style], [class], [id]')).toHaveCount(0);
  await expect(view.getByRole('link', { name: 'tracker' })).toHaveAttribute('href', 'https://example.com/pixel.png');
  await expect(view.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(page).not.toHaveTitle('ran');

  // An agent adds to the description while the editor is open; saving keeps both.
  await view.click();
  const field = page.locator('textarea.description-field');
  await expect(field).toBeVisible();
  await callTool(request, server.url, 'update_card', { card: 'SAF-1', append_description: 'Added by the agent.' });
  await field.press(`${mod}+Home`);
  await field.pressSequentially('Edited by Sam. ');
  await field.press(`${mod}+Enter`);
  await expect(view).toContainText('Edited by Sam. Plain bold text.');
  await expect(view).toContainText('Added by the agent.');
});
