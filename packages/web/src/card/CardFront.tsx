/**
 * A card as it sits in a status: its labels, its title, and a quiet row with
 * the card ref, the due day, and badges that show only when there is
 * something to count. A card in a `done` status reads as finished. The whole
 * card is a link to its card back, and doubles as the drag handle.
 */
import type { HTMLAttributes, MouseEvent } from 'react';
import { AlignLeft, CalendarDays, CheckSquare, CircleCheck, Link2, MessageSquare, Paperclip } from 'lucide-react';
import { cardPath, checklistProgress, formatCardRef, type Card, type Label, type StatusKind } from '@corkboard/model';
import { useServices } from '../app/services.js';
import { shortDay, todayDay } from '../app/time.js';
import { LabelChip } from '../labels/LabelChip.js';
import { dueState } from './due.js';

export function CardFront({
  card,
  labels,
  boardKey,
  kind,
  flashing = false,
  overlay = false,
  dragHandle,
}: {
  card: Card;
  labels: Label[];
  boardKey: string;
  kind: StatusKind | null;
  flashing?: boolean;
  /** Drawn under the pointer while dragging. */
  overlay?: boolean;
  dragHandle?: HTMLAttributes<HTMLElement>;
}) {
  const { router } = useServices();
  const ref = formatCardRef(boardKey, card.number);
  const href = cardPath(ref);
  const today = todayDay();
  const due = dueState(card.due, today, kind);
  const progress = checklistProgress(card);
  const done = kind === 'done';
  const open = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    router.navigate(href);
  };
  return (
    <a
      {...dragHandle}
      href={href}
      onClick={open}
      className={`card-front ${done ? 'is-done' : ''} ${flashing ? 'is-flashing' : ''} ${overlay ? 'is-overlay' : ''}`}
      data-card-id={card.id}
    >
      {labels.length > 0 && (
        <span className="card-labels">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} small />
          ))}
        </span>
      )}
      <span className="card-title">
        {done && <CircleCheck size={15} className="card-done-mark" aria-hidden="true" />}
        {done && <span className="visually-hidden">Finished: </span>}
        {card.title}
      </span>
      <span className="card-meta">
        <span className="card-ref">{ref}</span>
        {card.due !== null && (
          <span className={`badge due-${due}`} title={due === 'overdue' ? `Overdue, was due ${card.due}` : `Due ${card.due}`}>
            <CalendarDays size={13} aria-hidden="true" />
            {shortDay(card.due, today)}
            {due === 'overdue' && <span className="visually-hidden"> (overdue)</span>}
          </span>
        )}
        {card.description.trim() !== '' && (
          <span className="badge" title="Has a description">
            <AlignLeft size={13} aria-hidden="true" />
            <span className="visually-hidden">Has a description</span>
          </span>
        )}
        {progress.total > 0 && (
          <span className={`badge ${progress.done === progress.total ? 'is-complete' : ''}`} title={`Checklist: ${progress.done} of ${progress.total} done`}>
            <CheckSquare size={13} aria-hidden="true" />
            {progress.done}/{progress.total}
          </span>
        )}
        <Count icon={<MessageSquare size={13} aria-hidden="true" />} count={card.comments.length} noun="comment" />
        <Count icon={<Link2 size={13} aria-hidden="true" />} count={card.links.length} noun="link" />
        <Count icon={<Paperclip size={13} aria-hidden="true" />} count={card.attachments.length} noun="attachment" />
      </span>
    </a>
  );
}

function Count({ icon, count, noun }: { icon: JSX.Element; count: number; noun: string }) {
  if (count === 0) return null;
  const label = count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
  return (
    <span className="badge" title={label}>
      {icon}
      {count}
      <span className="visually-hidden"> {count === 1 ? noun : `${noun}s`}</span>
    </span>
  );
}
