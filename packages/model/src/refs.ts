/**
 * The text forms that point at things: a card ref (`WEB-12`), and a link
 * target, which is a URL or `looseleaf:<pageId>` for a page in Looseleaf.
 */
import { BOARD_KEY_MAX_LENGTH } from './workspace.js';

/** `WEB-12` for card 12 on the board whose key is WEB. */
export function formatCardRef(boardKey: string, cardNumber: number): string {
  return `${boardKey}-${cardNumber}`;
}

/**
 * Reads a card ref out of what a person or an agent typed: `WEB-12`,
 * `web-12`, `#WEB-12`, or a card's address ending in `/c/WEB-12`. Null when
 * the text holds no ref. A key longer than a board key can be is no ref, so a
 * card id that happens to end in a dash and digits is not read as one.
 */
export function parseCardRef(text: string): { key: string; number: number } | null {
  const match = /(?:^|[/#\s])([A-Za-z][A-Za-z0-9]*)-(\d+)\/?$/.exec(text.trim());
  if (match === null || match[1]!.length > BOARD_KEY_MAX_LENGTH) return null;
  return { key: match[1]!.toUpperCase(), number: Number(match[2]) };
}

/** The path of a card in the web client, under the server's address. */
export function cardPath(ref: string): string {
  return `/c/${ref}`;
}

/** The path of a board in the web client. */
export function boardPath(boardKey: string): string {
  return `/b/${boardKey}`;
}

const LOOSELEAF_PREFIX = 'looseleaf:';

/** The link target for a Looseleaf page. */
export function looseleafTarget(pageId: string): string {
  return `${LOOSELEAF_PREFIX}${pageId}`;
}

export type LinkTarget = { kind: 'looseleaf'; pageId: string } | { kind: 'url'; url: string };

/** What a link target points at, or null when it is neither a Looseleaf page nor an http(s) URL. */
export function parseLinkTarget(target: string): LinkTarget | null {
  const trimmed = target.trim();
  if (trimmed.startsWith(LOOSELEAF_PREFIX)) {
    const pageId = trimmed.slice(LOOSELEAF_PREFIX.length);
    return /^[A-Za-z0-9_-]+$/.test(pageId) ? { kind: 'looseleaf', pageId } : null;
  }
  return /^https?:\/\/\S+$/i.test(trimmed) ? { kind: 'url', url: trimmed } : null;
}
