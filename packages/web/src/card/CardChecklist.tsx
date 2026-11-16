/**
 * The checklist: a progress bar, items to tick, edit, delete and drag into
 * order, and a field that adds an item on Enter and stays open for the next.
 */
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, GripVertical, Trash2 } from 'lucide-react';
import { addChecklistItem, checklistProgress, moveChecklistItem, removeChecklistItem, updateChecklistItem, type Card, type ChecklistItem } from '@corkboard/model';
import { IconButton } from '../app/controls.js';
import { useCurrentBoard } from '../board/board-context.js';

export function CardChecklist({ card }: { card: Card }) {
  const { doc } = useCurrentBoard();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const progress = checklistProgress(card);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '') return;
    addChecklistItem(doc, card.id, text);
    setText('');
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const index = card.checklist.findIndex((item) => item.id === over.id);
    if (index !== -1) moveChecklistItem(doc, card.id, String(active.id), index);
  };

  return (
    <section className="card-section" aria-labelledby="checklist-heading">
      <h3 id="checklist-heading" className="section-heading">
        <CheckSquare size={16} aria-hidden="true" />
        Checklist
        {progress.total > 0 && (
          <span className="section-count">
            {progress.done} of {progress.total}
          </span>
        )}
      </h3>
      {progress.total > 0 && (
        <div className="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className={`progress-fill ${percent === 100 ? 'is-complete' : ''}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={card.checklist.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="checklist">
            {card.checklist.map((item) => (
              <ChecklistRow key={item.id} card={card} item={item} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {adding ? (
        <form className="checklist-add" onSubmit={add}>
          <input
            aria-label="New checklist item"
            placeholder="Add an item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              setAdding(false);
              setText('');
            }}
            onBlur={() => text.trim() === '' && setAdding(false)}
            maxLength={300}
          />
          <button type="submit" className="button primary" disabled={text.trim() === ''}>
            Add
          </button>
        </form>
      ) : (
        <button type="button" className="placeholder-button" onClick={() => setAdding(true)}>
          Add an item
        </button>
      )}
    </section>
  );
}

function ChecklistRow({ card, item }: { card: Card; item: ChecklistItem }) {
  const { doc } = useCurrentBoard();
  const sortable = useSortable({ id: item.id });
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() !== '' && draft.trim() !== item.text) updateChecklistItem(doc, card.id, item.id, { text: draft });
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
    }
  };
  return (
    <li
      ref={sortable.setNodeRef}
      className={`checklist-item ${item.done ? 'is-done' : ''} ${sortable.isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
    >
      <button type="button" className="grip" aria-label={`Move “${item.text}”`} {...sortable.attributes} {...sortable.listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => updateChecklistItem(doc, card.id, item.id, { done: e.target.checked })}
        aria-label={item.text}
      />
      {draft === null ? (
        <button type="button" className="checklist-text" onClick={() => setDraft(item.text)} title="Edit">
          {item.text}
        </button>
      ) : (
        <input className="checklist-edit" aria-label="Item text" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={save} autoFocus maxLength={300} />
      )}
      <IconButton label={`Delete “${item.text}”`} className="row-action" onClick={() => removeChecklistItem(doc, card.id, item.id)}>
        <Trash2 size={15} />
      </IconButton>
    </li>
  );
}
