/** The card back's label control: tick the board's labels on or off, or make a new one and put it on the card. */
import { useState, type FormEvent } from 'react';
import { createLabel, leastUsedColor, setCardLabel, type Card, type ColorName } from '@corkboard/model';
import { Popover } from '../app/controls.js';
import { useCurrentBoard } from '../board/board-context.js';
import { ColorSwatches } from './ColorSwatches.js';
import { LabelChip } from './LabelChip.js';

export function LabelPicker({ card, anchor, onClose }: { card: Card; anchor: HTMLElement | null; onClose: () => void }) {
  const { doc, board } = useCurrentBoard();
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorName>(() => leastUsedColor(board.labels.map((label) => label.color)));
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    const label = createLabel(doc, { name, color });
    setCardLabel(doc, card.id, label.id, true);
    setName('');
    setColor(leastUsedColor([...board.labels.map((existing) => existing.color), color]));
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="label-picker" label="Labels">
      {board.labels.length > 0 && (
        <ul className="check-list">
          {board.labels.map((label) => (
            <li key={label.id}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={card.labelIds.includes(label.id)}
                  onChange={(e) => setCardLabel(doc, card.id, label.id, e.target.checked)}
                />
                <LabelChip label={label} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <form className="stack label-create" onSubmit={create}>
        <label className="field">
          <span>New label</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, such as iOS" maxLength={40} />
        </label>
        <ColorSwatches value={color} onChange={setColor} />
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={name.trim() === ''}>
            Create label
          </button>
        </div>
      </form>
    </Popover>
  );
}
