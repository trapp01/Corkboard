/** Board settings: rename, recolour, and archive the board (restorable from the board switcher). */
import { useState, type FormEvent } from 'react';
import { archiveBoard, restoreBoard, updateBoard, type ColorName } from '@corkboard/model';
import { Dialog } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useCurrentBoard } from '../board/board-context.js';
import { ColorSwatches } from '../labels/ColorSwatches.js';

export function BoardSettingsDialog({ onClose }: { onClose: () => void }) {
  const { workspace, router, toasts } = useServices();
  const { entry } = useCurrentBoard();
  const [name, setName] = useState(entry.name);
  const [color, setColor] = useState<ColorName>(entry.color);
  const [confirming, setConfirming] = useState(false);

  const save = (event: FormEvent) => {
    event.preventDefault();
    updateBoard(workspace, entry.id, { name, color });
    onClose();
  };
  const archive = () => {
    archiveBoard(workspace, entry.id);
    onClose();
    router.navigate('/');
    toasts.show(`Archived ${entry.name}`, () => restoreBoard(workspace, entry.id));
  };

  return (
    <Dialog title="Board settings" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <div className="field">
          <span>Key</span>
          <p className="key-static">{entry.key}</p>
        </div>
        <ColorSwatches value={color} onChange={setColor} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={name.trim() === ''}>
            Save
          </button>
        </div>
      </form>
      <section className="settings-section danger-zone">
        <h3>Archive this board</h3>
        <p className="muted">The board and its cards are hidden. Restore it from Archived boards in the board switcher.</p>
        <div className="form-actions start">
          {confirming ? (
            <>
              <button type="button" className="button danger" onClick={archive}>
                Archive board
              </button>
              <button type="button" className="button" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="button" onClick={() => setConfirming(true)}>
              Archive board…
            </button>
          )}
        </div>
      </section>
    </Dialog>
  );
}
