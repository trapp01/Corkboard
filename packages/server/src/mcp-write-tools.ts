/**
 * The MCP tools that change a board: making and editing cards, moving them
 * between statuses, commenting, ticking checklist items, linking, archiving,
 * and adding boards, statuses and labels. Each change is one edit of the
 * board's doc, so it reaches every open web client at once.
 */
import {
  COLOR_NAMES,
  STATUS_KINDS,
  addChecklistItem,
  addComment,
  addLink,
  archiveCard,
  createCard,
  createLabel,
  createStatus,
  moveCard,
  parseLinkTarget,
  readBoard,
  removeChecklistItem,
  restoreCard,
  setCardLabel,
  updateCard,
  updateChecklistItem,
  type BoardSnapshot,
  type Card,
  type ColorName,
  type StatusKind,
} from '@corkboard/model';
import { NotFoundError, dueDay, nameCard, resolveLabel, resolveStatus } from './boards.js';
import { boardArgument } from './mcp-read-tools.js';
import type { McpProperty, McpTool } from './mcp-tools.js';

/** The actor recorded for a change when the caller does not give one. */
export const DEFAULT_AUTHOR = 'Agent';

const cardArgument: McpProperty = { type: 'string', description: 'A card ref such as WEB-12, the card address, or the card id.' };
const authorArgument: McpProperty = {
  type: 'string',
  description: `The name recorded as having made this change, shown in the card's activity; "${DEFAULT_AUTHOR}" when left out.`,
};
const writes = { readOnlyHint: false } as const;

function author(args: Record<string, unknown>): string {
  const name = typeof args.author === 'string' ? args.author.trim() : '';
  return name === '' ? DEFAULT_AUTHOR : name;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]).map((text) => text.trim()).filter((text) => text !== '') : [];
}

function linkTarget(target: string): string {
  if (parseLinkTarget(target) === null) {
    throw new NotFoundError(`"${target}" is not a link target. Give an http(s) address, or looseleaf:<page id> for a Looseleaf page.`);
  }
  return target.trim();
}

/** The checklist item a caller named by its id or by its exact text, ignoring case. */
function checklistItemId(card: Card, text: string): string {
  const wanted = text.trim().toLowerCase();
  const item = card.checklist.find((candidate) => candidate.id === text.trim()) ?? card.checklist.find((candidate) => candidate.text.toLowerCase() === wanted);
  if (item === undefined) {
    const items = card.checklist.map((candidate) => `"${candidate.text}"`).join(', ');
    throw new NotFoundError(`The card has no checklist item "${text}". Its items are: ${items || 'none yet'}.`);
  }
  return item.id;
}

function currentCard(board: BoardSnapshot, cardId: string): Card {
  return board.cards.find((card) => card.id === cardId)!;
}

export const WRITE_TOOLS: readonly McpTool[] = [
  {
    name: 'create_card',
    description:
      'Adds a card to a board and returns its ref. Write the title as the task in a few words and the description so ' +
      'someone with no other context could pick it up: what is wanted, why, and how to tell it is finished. The card ' +
      'goes to the bottom of the board\'s first status unless a status or place is given. Labels must exist on the board.',
    inputSchema: {
      type: 'object',
      properties: {
        board: boardArgument,
        title: { type: 'string', description: 'The task in a few words.' },
        description: { type: 'string', description: 'Markdown.' },
        status: { type: 'string', description: 'A status name, or a kind (todo, doing, done) for the first status of that kind.' },
        place: { type: 'string', description: 'Where in the status the card goes; bottom when left out.', enum: ['top', 'bottom'] },
        labels: { type: 'array', description: 'Names of labels to put on the card.', items: { type: 'string' } },
        due: { type: 'string', description: 'The due day as YYYY-MM-DD.' },
        checklist: { type: 'array', description: 'Checklist items, in order: the steps of the task.', items: { type: 'string' } },
        links: {
          type: 'array',
          description: 'Things the card points at: a branch or pull request address, an issue, or a Looseleaf page.',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'An http(s) address, or looseleaf:<page id> for a Looseleaf page.' },
              title: { type: 'string', description: 'What the link is, in a few words.' },
            },
            required: ['target', 'title'],
            additionalProperties: false,
          },
        },
        author: authorArgument,
      },
      required: ['title'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards, baseUrl }, args) {
      const entry = await boards.entry(args.board as string | undefined);
      const title = (args.title as string).trim();
      if (title === '') throw new NotFoundError('create_card needs a title that is not empty.');
      const due = typeof args.due === 'string' ? dueDay(args.due) : null;
      const links = ((args.links as Array<{ target: string; title: string }> | undefined) ?? []).map((link) => ({
        target: linkTarget(link.target),
        title: link.title.trim(),
      }));
      const { card, status } = await boards.edit(entry.id, (doc) => {
        const board = readBoard(doc);
        const target = typeof args.status === 'string' ? resolveStatus(board, args.status) : board.statuses[0];
        if (target === undefined) throw new NotFoundError(`${entry.name} has no statuses yet. Add one with create_status.`);
        const created = createCard(doc, {
          title,
          statusId: target.id,
          place: (args.place as 'top' | 'bottom' | undefined) ?? 'bottom',
          description: args.description as string | undefined,
          labelIds: texts(args.labels).map((name) => resolveLabel(board, name).id),
          due,
          checklist: texts(args.checklist),
          links,
          by: author(args),
        });
        return { card: created, status: target };
      });
      return `Created ${nameCard(entry.key, card)} in ${status.name}.\nAddress: ${baseUrl}/c/${entry.key}-${card.number}\n`;
    },
  },
  {
    name: 'update_card',
    description:
      'Changes a card\'s title, description, due day or labels. Only what is given changes. `description` replaces the ' +
      'whole description; `append_description` adds a paragraph to its end and is the safer one when the user may be ' +
      'editing. To change the status use move_card.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        title: { type: 'string', description: 'The new title.' },
        description: { type: 'string', description: 'Markdown that replaces the whole description.' },
        append_description: { type: 'string', description: 'Markdown added to the end of the description.' },
        due: { type: 'string', description: 'The due day as YYYY-MM-DD, or "none" to clear it.' },
        add_labels: { type: 'array', description: 'Names of labels to put on the card.', items: { type: 'string' } },
        remove_labels: { type: 'array', description: 'Names of labels to take off the card.', items: { type: 'string' } },
      },
      required: ['card'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      const due = typeof args.due === 'string' ? dueDay(args.due) : undefined;
      const after = await boards.edit(entry.id, (doc) => {
        const board = readBoard(doc);
        const adding = texts(args.add_labels).map((name) => resolveLabel(board, name).id);
        const removing = texts(args.remove_labels).map((name) => resolveLabel(board, name).id);
        let description = args.description as string | undefined;
        if (typeof args.append_description === 'string' && args.append_description.trim() !== '') {
          const base = (description ?? currentCard(board, card.id).description).trimEnd();
          description = base === '' ? args.append_description.trim() : `${base}\n\n${args.append_description.trim()}`;
        }
        updateCard(doc, card.id, { title: args.title as string | undefined, description, due });
        for (const labelId of adding) setCardLabel(doc, card.id, labelId, true);
        for (const labelId of removing) setCardLabel(doc, card.id, labelId, false);
        return currentCard(readBoard(doc), card.id);
      });
      return `Updated ${nameCard(entry.key, after)}.\n`;
    },
  },
  {
    name: 'move_card',
    description:
      'Moves a card to a status, which is how the board shows where a task stands. Move a card to a doing status when ' +
      'work on it starts and to a done status when it is finished. Within a status, higher means more important: the ' +
      'card goes to the bottom unless a place or position is given. An archived card is not moved; restore it first.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        status: { type: 'string', description: 'A status name, or a kind (todo, doing, done) for the first status of that kind.' },
        place: { type: 'string', description: 'The top or the bottom of the status; bottom when left out.', enum: ['top', 'bottom'] },
        position: { type: 'integer', description: 'A position counted from the top, 1 being first. Wins over place.', minimum: 1 },
        author: authorArgument,
      },
      required: ['card', 'status'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      if (card.archivedAt !== null) {
        throw new NotFoundError(`${nameCard(entry.key, card)} is archived. Restore it with archive_card and restore: true, then move it.`);
      }
      const status = await boards.edit(entry.id, (doc) => {
        const target = resolveStatus(readBoard(doc), args.status as string);
        const place = typeof args.position === 'number' ? args.position - 1 : ((args.place as 'top' | 'bottom' | undefined) ?? 'bottom');
        moveCard(doc, card.id, { statusId: target.id, place }, author(args));
        return target;
      });
      return `Moved ${nameCard(entry.key, card)} to ${status.name} (${status.kind}).\n`;
    },
  },
  {
    name: 'add_comment',
    description:
      'Adds a comment to a card. Use it to leave what the next reader needs: a finding, a decision and why, what blocks ' +
      'the task, or, when stopping, what was done, what is left and how to check it.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        body: { type: 'string', description: 'Markdown.' },
        author: authorArgument,
      },
      required: ['card', 'body'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      const body = (args.body as string).trim();
      if (body === '') throw new NotFoundError('add_comment needs a body that is not empty.');
      await boards.edit(entry.id, (doc) => addComment(doc, card.id, body, author(args)));
      return `Commented on ${nameCard(entry.key, card)}.\n`;
    },
  },
  {
    name: 'update_checklist',
    description:
      'Changes a card\'s checklist: adds items to its end, ticks or unticks items, and removes items. Name an existing ' +
      'item by its id from get_card or by its exact text. Tick each step as it is finished so the board shows progress.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        add: { type: 'array', description: 'Texts of items to add, in order.', items: { type: 'string' } },
        check: { type: 'array', description: 'Items to tick.', items: { type: 'string' } },
        uncheck: { type: 'array', description: 'Items to untick.', items: { type: 'string' } },
        remove: { type: 'array', description: 'Items to remove.', items: { type: 'string' } },
      },
      required: ['card'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      const after = await boards.edit(entry.id, (doc) => {
        const before = currentCard(readBoard(doc), card.id);
        const check = texts(args.check).map((text) => checklistItemId(before, text));
        const uncheck = texts(args.uncheck).map((text) => checklistItemId(before, text));
        const remove = texts(args.remove).map((text) => checklistItemId(before, text));
        for (const text of texts(args.add)) addChecklistItem(doc, card.id, text);
        for (const itemId of check) updateChecklistItem(doc, card.id, itemId, { done: true });
        for (const itemId of uncheck) updateChecklistItem(doc, card.id, itemId, { done: false });
        for (const itemId of remove) removeChecklistItem(doc, card.id, itemId);
        return currentCard(readBoard(doc), card.id);
      });
      const done = after.checklist.filter((item) => item.done).length;
      return `Checklist of ${nameCard(entry.key, after)} is now ${done}/${after.checklist.length} done.\n`;
    },
  },
  {
    name: 'add_link',
    description:
      'Links a card to something outside the board: a branch or pull request, an issue, a document, or a page in ' +
      'Looseleaf (the user\'s notebook) as looseleaf:<page id>. A card keeps one link per target; linking the same ' +
      'target again only changes its title.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        target: { type: 'string', description: 'An http(s) address, or looseleaf:<page id> for a Looseleaf page.' },
        title: { type: 'string', description: 'What the link is, in a few words.' },
      },
      required: ['card', 'target', 'title'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      const target = linkTarget(args.target as string);
      await boards.edit(entry.id, (doc) => addLink(doc, card.id, { target, title: (args.title as string).trim() }));
      return `Linked ${nameCard(entry.key, card)} to ${target}.\n`;
    },
  },
  {
    name: 'archive_card',
    description:
      'Archives a card, which hides it from the board without deleting it, or restores an archived card. Archive only ' +
      'a card the user asked to be rid of; a finished task is moved to a done status instead.',
    inputSchema: {
      type: 'object',
      properties: {
        card: cardArgument,
        restore: { type: 'boolean', description: 'True to bring an archived card back; false when left out.' },
        author: authorArgument,
      },
      required: ['card'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const { entry, card } = await boards.card(args.card as string);
      const restore = args.restore === true;
      await boards.edit(entry.id, (doc) => (restore ? restoreCard(doc, card.id, author(args)) : archiveCard(doc, card.id, author(args))));
      return `${restore ? 'Restored' : 'Archived'} ${nameCard(entry.key, card)}.\n`;
    },
  },
  {
    name: 'create_board',
    description:
      'Adds a board with the statuses Backlog, This week, In progress, Blocked and Done, and returns its key. Card ' +
      'refs on the board start with the key. Most work belongs on a board that already exists; check list_boards first.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The board\'s name.' },
        key: { type: 'string', description: 'Up to 6 letters and digits that card refs start with, such as WEB. Made from the name when left out.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards, baseUrl }, args) {
      const name = (args.name as string).trim();
      if (name === '') throw new NotFoundError('create_board needs a name that is not empty.');
      const entry = await boards.create({ name, key: args.key as string | undefined });
      return `Created the board ${entry.name} with the key ${entry.key}.\nAddress: ${baseUrl}/b/${entry.key}\n`;
    },
  },
  {
    name: 'create_status',
    description:
      'Adds a status (a column) to a board. Its kind says what it means for the work on its cards, whatever it is ' +
      'called: todo for not started, doing for being worked on or waiting, done for finished.',
    inputSchema: {
      type: 'object',
      properties: {
        board: boardArgument,
        name: { type: 'string', description: 'The status name, such as In review.' },
        kind: { type: 'string', description: 'What the status means for the work.', enum: STATUS_KINDS },
        position: { type: 'integer', description: 'Where it goes among the statuses, 1 being first; last when left out.', minimum: 1 },
      },
      required: ['name', 'kind'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const entry = await boards.entry(args.board as string | undefined);
      const name = (args.name as string).trim();
      if (name === '') throw new NotFoundError('create_status needs a name that is not empty.');
      const order = await boards.edit(entry.id, (doc) => {
        if (readBoard(doc).statuses.some((status) => status.name.toLowerCase() === name.toLowerCase())) {
          throw new NotFoundError(`${entry.name} already has a status called "${name}".`);
        }
        createStatus(doc, { name, kind: args.kind as StatusKind, index: typeof args.position === 'number' ? args.position - 1 : undefined });
        return readBoard(doc).statuses.map((status) => status.name);
      });
      return `Added the status ${name} to ${entry.name}. Its statuses are now: ${order.join(' → ')}.\n`;
    },
  },
  {
    name: 'create_label',
    description:
      'Adds a label to a board. Labels say what a card is about across statuses, such as the app or area it touches, ' +
      'and a card can carry several.',
    inputSchema: {
      type: 'object',
      properties: {
        board: boardArgument,
        name: { type: 'string', description: 'The label name, such as iOS driver app.' },
        color: { type: 'string', description: 'The label colour; the one used least so far when left out.', enum: COLOR_NAMES },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: writes,
    async run({ boards }, args) {
      const entry = await boards.entry(args.board as string | undefined);
      const name = (args.name as string).trim();
      if (name === '') throw new NotFoundError('create_label needs a name that is not empty.');
      const label = await boards.edit(entry.id, (doc) => {
        if (readBoard(doc).labels.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) {
          throw new NotFoundError(`${entry.name} already has a label called "${name}".`);
        }
        return createLabel(doc, { name, color: args.color as ColorName | undefined });
      });
      return `Added the ${label.color} label ${label.name} to ${entry.name}.\n`;
    },
  },
];
