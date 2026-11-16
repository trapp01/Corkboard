/** The MCP tools that only read: the boards, one board at a glance, a search, and one card in full. */
import {
  cardsInStatus,
  findStatus,
  looseleafTarget,
  parseLinkTarget,
  renderBoard,
  renderCard,
  renderCardLine,
  searchCards,
  shownStatusId,
} from '@corkboard/model';
import { dueDay, resolveLabel, resolveStatus } from './boards.js';
import type { McpTool } from './mcp-tools.js';

export const SEARCH_DEFAULT_LIMIT = 25;
export const SEARCH_MAX_LIMIT = 100;

export const boardArgument = {
  type: 'string',
  description: 'A board key such as WEB, or its name. Can be left out when there is only one board.',
} as const;

export const READ_TOOLS: readonly McpTool[] = [
  {
    name: 'list_boards',
    description:
      'Lists every board with its key, its statuses in order (each with its kind — todo, doing or done — and its number ' +
      'of cards) and its labels. Start here when you do not know the board.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ boards, baseUrl }) {
      const entries = await boards.list();
      if (entries.length === 0) return 'There are no boards yet. Create one with create_board.';
      const sections: string[] = [];
      for (const entry of entries) {
        const { board } = await boards.open(entry.id);
        const statuses = board.statuses.map((status) => `${status.name} (${status.kind}, ${cardsInStatus(board, status.id).length})`);
        sections.push(
          [
            `## ${entry.name} (${entry.key})`,
            `Address: ${baseUrl}/b/${entry.key}`,
            `Statuses: ${statuses.join(' → ') || 'none yet'}`,
            `Labels: ${board.labels.map((label) => label.name).join(', ') || 'none yet'}`,
          ].join('\n'),
        );
      }
      return sections.join('\n\n') + '\n';
    },
  },
  {
    name: 'get_board',
    description:
      'Shows one board at a glance: every status in order with its cards, top first. A card higher in a status matters ' +
      'more. Each card line has its ref (such as WEB-12), title, labels, due day, checklist progress and comment count. ' +
      'Narrow it to one status or one label to see less.',
    inputSchema: {
      type: 'object',
      properties: {
        board: boardArgument,
        status: { type: 'string', description: 'Only this status: its name, or a kind (todo, doing, done) for the first status of that kind.' },
        label: { type: 'string', description: 'Only cards carrying this label, by name.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ boards, baseUrl }, args) {
      const { entry, board } = await boards.open(args.board as string | undefined);
      let shown = board;
      if (typeof args.label === 'string') {
        const label = resolveLabel(board, args.label);
        shown = { ...shown, cards: shown.cards.filter((card) => card.labelIds.includes(label.id)) };
      }
      if (typeof args.status === 'string') {
        const status = resolveStatus(board, args.status);
        // Narrow the cards too: a card whose status is not listed would otherwise show under the first one that is.
        shown = { ...shown, statuses: [status], cards: shown.cards.filter((card) => shownStatusId(board, card) === status.id) };
      }
      return renderBoard(entry, shown, { baseUrl });
    },
  },
  {
    name: 'search_cards',
    description:
      'Finds cards by words and filters, across every board unless one is named. The query is split into words; a card ' +
      'matches when every word appears in its title, description, labels, checklist, links or comments. Title matches ' +
      'come first. With no query, the most recently changed cards come first. Each result shows the card line and its ' +
      'status. Use get_card on a result to read it in full.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find, separated by spaces.' },
        board: { type: 'string', description: 'Only this board: its key or name.' },
        status: { type: 'string', description: 'Only this status: its name, or a kind (todo, doing, done) for every status of that kind.' },
        label: { type: 'string', description: 'Only cards carrying this label, by name.' },
        due_by: { type: 'string', description: 'Only cards due on or before this day, as YYYY-MM-DD.' },
        include_archived: { type: 'boolean', description: 'Also search archived cards; false when left out.' },
        limit: { type: 'integer', description: `Most results to return; ${SEARCH_DEFAULT_LIMIT} when left out.`, minimum: 1, maximum: SEARCH_MAX_LIMIT },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ boards }, args) {
      const entries = typeof args.board === 'string' ? [await boards.entry(args.board)] : await boards.list();
      const limit = (args.limit as number | undefined) ?? SEARCH_DEFAULT_LIMIT;
      const dueBy = typeof args.due_by === 'string' ? (dueDay(args.due_by) ?? undefined) : undefined;
      const statusText = typeof args.status === 'string' ? args.status.trim().toLowerCase() : null;
      const labelText = typeof args.label === 'string' ? args.label.trim().toLowerCase() : null;
      const lines: string[] = [];
      let total = 0;
      for (const entry of entries) {
        const { board } = await boards.open(entry.id);
        const label = labelText === null ? null : board.labels.find((candidate) => candidate.name.toLowerCase() === labelText);
        if (label === undefined) continue;
        const statusIds =
          statusText === null
            ? null
            : board.statuses.filter((status) => status.name.toLowerCase() === statusText || status.kind === statusText).map((status) => status.id);
        const found = searchCards(board, {
          query: args.query as string | undefined,
          labelId: label?.id,
          dueBy,
          includeArchived: args.include_archived === true,
        }).filter((card) => statusIds === null || statusIds.includes(card.statusId));
        total += found.length;
        for (const card of found) {
          if (lines.length >= limit) break;
          const status = findStatus(board, card.statusId);
          const hidden = card.archivedAt !== null || shownStatusId(board, card) === null ? ' (archived)' : '';
          lines.push(`- ${renderCardLine(entry, board, card)} — ${status?.name ?? 'no status'}${hidden}`);
        }
      }
      if (total === 0) return 'No cards match. Try fewer words, or list_boards to check the status and label names.';
      const heading = total > lines.length ? `Showing ${lines.length} of ${total} matching cards.` : `${total} matching card${total === 1 ? '' : 's'}.`;
      return `${heading}\n\n${lines.join('\n')}\n`;
    },
  },
  {
    name: 'get_card',
    description:
      'Returns everything on one card as Markdown: its status and position, labels, due day, description, checklist ' +
      '(each item with its id), links, attachments, comments and activity. When a link points at a Looseleaf page and ' +
      'this server is connected to Looseleaf, the page text is included under the link. Read this before working on a ' +
      'card. The Id line is the card\'s permanent id; every tool takes it in place of a ref.',
    inputSchema: {
      type: 'object',
      properties: { card: { type: 'string', description: 'A card ref such as WEB-12, the card address, or the card id.' } },
      required: ['card'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ boards, baseUrl, looseleaf }, args) {
      const { entry, board, card } = await boards.card(args.card as string);
      const linkedText = new Map<string, string>();
      if (looseleaf !== null) {
        // Asked together, so a Looseleaf that does not answer costs one timeout however many pages are linked.
        await Promise.all(
          card.links.map(async (link) => {
            const target = parseLinkTarget(link.target);
            if (target?.kind !== 'looseleaf') return;
            const text = await looseleaf.readPage(target.pageId);
            if (text !== null) linkedText.set(looseleafTarget(target.pageId), text);
          }),
        );
      }
      return renderCard(entry, board, card, { baseUrl, linkedText });
    },
  },
];
