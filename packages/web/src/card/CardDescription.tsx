/**
 * The description: rendered Markdown, or a textarea once pressed. Cmd/Ctrl+Enter
 * or Save keeps the text, Escape or Cancel drops the edit. Saving applies only
 * what was changed since the textarea opened, so text an agent or another
 * device added meanwhile survives.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { AlignLeft } from 'lucide-react';
import { updateCard, type Card } from '@corkboard/model';
import { isMac } from '../app/services.js';
import { useCurrentBoard } from '../board/board-context.js';
import { Markdown } from './Markdown.js';

export function CardDescription({ card }: { card: Card }) {
  const { doc } = useCurrentBoard();
  const [draft, setDraft] = useState<string | null>(null);
  /** The description as it read when the textarea opened. */
  const opened = useRef('');
  const editing = draft !== null;
  const startEditing = () => {
    opened.current = card.description;
    setDraft(card.description);
  };
  const field = useRef<HTMLTextAreaElement>(null);

  const save = () => {
    if (draft !== null && draft !== opened.current) updateCard(doc, card.id, { description: draft, descriptionBase: opened.current });
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
    }
  };

  return (
    <section className="card-section" aria-labelledby="description-heading">
      <h3 id="description-heading" className="section-heading">
        <AlignLeft size={16} aria-hidden="true" />
        Description
      </h3>
      {editing ? (
        <div className="description-editor">
          <textarea
            ref={field}
            aria-label="Description"
            className="description-field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
            placeholder="Markdown works here: **bold**, lists, links, `code`."
          />
          <div className="form-actions start">
            <button type="button" className="button primary" onClick={save}>
              Save
            </button>
            <button type="button" className="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <span className="muted small">{isMac ? '⌘' : 'Ctrl'}+Enter saves</span>
          </div>
        </div>
      ) : card.description.trim() === '' ? (
        <button type="button" className="placeholder-button" onClick={startEditing}>
          Add a description
        </button>
      ) : (
        <Markdown
          className="description-view"
          text={card.description}
          onEdit={startEditing}
          editLabel="Edit description"
        />
      )}
    </section>
  );
}
