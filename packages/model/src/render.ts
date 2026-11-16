/**
 * A board and a card written out as Markdown, the form the MCP endpoint
 * answers in. `renderCard` is the whole card, so a reader needs nothing else
 * to pick the task up; `renderBoard` is the board at a glance.
 */
import {
  cardLabels,
  cardsInStatus,
  checklistProgress,
  findStatus,
  shownStatusId,
  type Activity,
  type BoardSnapshot,
  type Card,
} from './board.js';
import { formatCardRef, parseLinkTarget } from './refs.js';
import type { BoardEntry } from './workspace.js';

export interface RenderOptions {
  /** The server's address, e.g. `http://127.0.0.1:8422`; card and board addresses are left out without it. */
  baseUrl?: string;
  /** Text to show under a link, keyed by the link's target: the content of a linked Looseleaf page. */
  linkedText?: ReadonlyMap<string, string>;
  /** Cards listed per status in `renderBoard` before the rest are counted; every card when left out. */
  cardsPerStatus?: number;
}

function day(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function minute(time: number): string {
  return new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** One line for a card in a list: its ref, title and what is on it. */
export function renderCardLine(entry: BoardEntry, board: BoardSnapshot, card: Card): string {
  const parts = [`${formatCardRef(entry.key, card.number)} ${card.title}`];
  const labels = cardLabels(board, card).map((label) => label.name);
  if (labels.length > 0) parts.push(`[${labels.join(', ')}]`);
  if (card.due !== null) parts.push(`due ${card.due}`);
  const progress = checklistProgress(card);
  if (progress.total > 0) parts.push(`checklist ${progress.done}/${progress.total}`);
  if (card.comments.length > 0) parts.push(`${card.comments.length} comment${card.comments.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The board at a glance: every status in order with its cards, top first. */
export function renderBoard(entry: BoardEntry, board: BoardSnapshot, options: RenderOptions = {}): string {
  const lines = [`# ${entry.name} (${entry.key})`, ''];
  if (options.baseUrl) lines.push(`Address: ${options.baseUrl}/b/${entry.key}`, '');
  if (board.labels.length > 0) lines.push(`Labels: ${board.labels.map((label) => label.name).join(', ')}`, '');
  if (board.statuses.length === 0) lines.push('This board has no statuses yet.');
  for (const status of board.statuses) {
    const cards = cardsInStatus(board, status.id);
    lines.push(`## ${status.name} (${status.kind}, ${cards.length} card${cards.length === 1 ? '' : 's'})`, '');
    const shown = options.cardsPerStatus === undefined ? cards : cards.slice(0, options.cardsPerStatus);
    for (const card of shown) lines.push(`- ${renderCardLine(entry, board, card)}`);
    if (shown.length < cards.length) lines.push(`- … and ${cards.length - shown.length} more`);
    if (cards.length > 0) lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function activityLine(entry: Activity): string {
  switch (entry.type) {
    case 'created':
      return `${entry.by} created this card in ${entry.status}`;
    case 'moved':
      return `${entry.by} moved it from ${entry.from} to ${entry.to}`;
    case 'archived':
      return `${entry.by} archived it`;
    case 'restored':
      return `${entry.by} restored it`;
  }
}

/** Everything on one card: where it stands, what it asks for, its checklist, links, comments and history. */
export function renderCard(entry: BoardEntry, board: BoardSnapshot, card: Card, options: RenderOptions = {}): string {
  const ref = formatCardRef(entry.key, card.number);
  const status = findStatus(board, card.statusId);
  const hidden = card.archivedAt !== null ? ' — archived' : shownStatusId(board, card) === null ? ' — in an archived status' : '';
  const labels = cardLabels(board, card).map((label) => label.name);
  const lines = [`# ${ref} ${card.title}`, ''];
  lines.push(`- Board: ${entry.name}`);
  lines.push(`- Status: ${status === null ? 'unknown' : `${status.name} (${status.kind})`}${hidden}`);
  if (status !== null && hidden === '') {
    const siblings = cardsInStatus(board, status.id);
    lines.push(`- Position: ${siblings.findIndex((sibling) => sibling.id === card.id) + 1} of ${siblings.length} in ${status.name}`);
  }
  lines.push(`- Labels: ${labels.length > 0 ? labels.join(', ') : 'none'}`);
  if (card.due !== null) lines.push(`- Due: ${card.due}`);
  lines.push(`- Created: ${day(card.createdAt)} by ${card.createdBy}`);
  lines.push(`- Last changed: ${minute(card.updatedAt)}`);
  if (options.baseUrl) lines.push(`- Address: ${options.baseUrl}/c/${ref}`);
  lines.push(`- Id: ${card.id}`);

  lines.push('', '## Description', '', card.description.trim() === '' ? '_No description._' : card.description.trim());

  if (card.checklist.length > 0) {
    const progress = checklistProgress(card);
    lines.push('', `## Checklist (${progress.done}/${progress.total})`, '');
    for (const item of card.checklist) lines.push(`- [${item.done ? 'x' : ' '}] ${item.text} (item ${item.id})`);
  }

  if (card.links.length > 0) {
    lines.push('', '## Links', '');
    for (const link of card.links) {
      const target = parseLinkTarget(link.target);
      const where = target?.kind === 'looseleaf' ? `Looseleaf page ${target.pageId}` : link.target;
      lines.push(`- ${link.title || where}${link.title ? ` — ${where}` : ''}`);
      const text = options.linkedText?.get(link.target);
      if (text !== undefined && text.trim() !== '') {
        lines.push('', ...text.trim().split('\n').map((line) => `  > ${line}`), '');
      }
    }
  }

  if (card.attachments.length > 0) {
    lines.push('', '## Attachments', '');
    for (const file of card.attachments) lines.push(`- ${file.name} (${file.mime}, ${file.size} bytes)`);
  }

  if (card.comments.length > 0) {
    lines.push('', `## Comments (${card.comments.length})`);
    for (const comment of card.comments) {
      lines.push('', `### ${comment.by}, ${minute(comment.at)}${comment.editedAt !== null ? ' (edited)' : ''}`, '', comment.body.trim());
    }
  }

  if (card.activity.length > 0) {
    lines.push('', '## Activity', '');
    for (const activity of card.activity) lines.push(`- ${minute(activity.at)}: ${activityLine(activity)}`);
  }
  return lines.join('\n').trimEnd() + '\n';
}
