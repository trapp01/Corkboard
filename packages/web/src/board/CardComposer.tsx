/**
 * The inline "Add a card" composer at the bottom of a status. Enter adds the
 * card and keeps the composer open for the next; Escape, or leaving it empty,
 * closes it.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { createCard } from '@corkboard/model';
import { IconButton } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useCurrentBoard } from './board-context.js';

export function CardComposer({ statusId, onClose }: { statusId: string; onClose: () => void }) {
  const { actor } = useServices();
  const { doc } = useCurrentBoard();
  const [title, setTitle] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const add = () => {
    if (title.trim() === '') return;
    createCard(doc, { title, statusId, place: 'bottom', by: actor.get() });
    setTitle('');
    requestAnimationFrame(() => field.current?.scrollIntoView({ block: 'nearest' }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <form
      className="card-composer"
      onSubmit={(event) => {
        event.preventDefault();
        add();
        field.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && title.trim() === '') onClose();
      }}
    >
      <textarea
        ref={field}
        className="composer-field"
        aria-label="Card title"
        placeholder="Card title"
        value={title}
        rows={2}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <button type="submit" className="button primary" disabled={title.trim() === ''}>
          Add card
        </button>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </form>
  );
}
