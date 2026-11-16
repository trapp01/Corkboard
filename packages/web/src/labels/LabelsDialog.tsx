/**
 * The board's labels: create, rename, recolour and delete. Deleting takes the
 * label off every card, so it asks first and says how many cards carry it.
 */
import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createLabel, deleteLabel, leastUsedColor, updateLabel, type ColorName, type Label } from '@corkboard/model';
import { Dialog, IconButton } from '../app/controls.js';
import { useCurrentBoard } from '../board/board-context.js';
import { ColorSwatches } from './ColorSwatches.js';
import { LabelChip } from './LabelChip.js';

export function LabelsDialog({ onClose }: { onClose: () => void }) {
  const { doc, board } = useCurrentBoard();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorName>(() => leastUsedColor(board.labels.map((label) => label.color)));

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    createLabel(doc, { name, color });
    setName('');
    setColor(leastUsedColor([...board.labels.map((label) => label.color), color]));
  };

  return (
    <Dialog title="Labels" onClose={onClose}>
      {board.labels.length === 0 && <p className="muted">Labels say what a card is about, such as the app it touches.</p>}
      <ul className="label-list">
        {board.labels.map((label) =>
          editing === label.id ? (
            <li key={label.id}>
              <LabelEditor label={label} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={label.id} className="label-row">
              <LabelChip label={label} />
              <span className="muted small">{usage(board.cards.filter((card) => card.labelIds.includes(label.id)).length)}</span>
              <span className="spacer" />
              {confirming === label.id ? (
                <span className="confirm-inline">
                  <span className="small">Delete and take it off every card?</span>
                  <button type="button" className="button danger" onClick={() => deleteLabel(doc, label.id)}>
                    Delete
                  </button>
                  <button type="button" className="button" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <>
                  <IconButton label={`Edit ${label.name}`} onClick={() => setEditing(label.id)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Delete ${label.name}`} onClick={() => setConfirming(label.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      <form className="stack section-gap" onSubmit={create}>
        <h3>New label</h3>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Such as iOS or Billing" maxLength={40} />
        </label>
        <ColorSwatches value={color} onChange={setColor} />
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={name.trim() === ''}>
            Create label
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function usage(count: number): string {
  return count === 0 ? 'On no cards' : count === 1 ? 'On 1 card' : `On ${count} cards`;
}

function LabelEditor({ label, onDone }: { label: Label; onDone: () => void }) {
  const { doc } = useCurrentBoard();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState<ColorName>(label.color);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    updateLabel(doc, label.id, { name, color });
    onDone();
  };
  return (
    <form className="stack label-editor" onSubmit={save}>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </label>
      <ColorSwatches value={color} onChange={setColor} />
      <div className="form-actions">
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={name.trim() === ''}>
          Save
        </button>
      </div>
    </form>
  );
}
