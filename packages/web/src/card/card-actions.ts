/** Card actions started from more than one place (the card back, the `c` shortcut), each with its notice. */
import type * as Y from 'yjs';
import { archiveCard, cardPath, formatCardRef, restoreCard, type Card } from '@corkboard/model';
import { copyText } from '../app/clipboard.js';
import type { Services } from '../app/services.js';

/** Archives the card and offers Undo, which restores it. */
export function archiveWithUndo(services: Services, doc: Y.Doc, card: Card, boardKey: string): void {
  const actor = services.actor.get();
  archiveCard(doc, card.id, actor);
  services.toasts.show(`Archived ${formatCardRef(boardKey, card.number)}`, () => restoreCard(doc, card.id, actor));
}

export async function copyCardRef(services: Services, card: Card, boardKey: string): Promise<void> {
  const ref = formatCardRef(boardKey, card.number);
  const copied = await copyText(ref);
  services.toasts.show(copied ? `Copied ${ref}` : `Couldn’t copy. The ref is ${ref}.`);
}

export async function copyCardLink(services: Services, card: Card, boardKey: string): Promise<void> {
  const link = `${location.origin}${cardPath(formatCardRef(boardKey, card.number))}`;
  const copied = await copyText(link);
  services.toasts.show(copied ? 'Copied link' : `Couldn’t copy. The link is ${link}`);
}
