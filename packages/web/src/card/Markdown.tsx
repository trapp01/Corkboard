/**
 * Markdown rendered and sanitized (see render-markdown.ts). With `onEdit`, a
 * press anywhere except on a link starts editing, and an Edit button does the
 * same from the keyboard.
 */
import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { renderMarkdown } from './render-markdown.js';

export function Markdown({ text, className = '', onEdit, editLabel = 'Edit' }: { text: string; className?: string; onEdit?: () => void; editLabel?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div className={`markdown-block ${onEdit ? 'is-editable' : ''}`}>
      <div
        className={`markdown ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(event) => {
          if (!onEdit || (event.target as HTMLElement).closest('a, input') || window.getSelection()?.toString()) return;
          onEdit();
        }}
      />
      {onEdit && (
        <button type="button" className="button subtle markdown-edit" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
          {editLabel}
        </button>
      )}
    </div>
  );
}
