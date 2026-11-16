/**
 * Making a board: a name, a key that follows the name until it is edited by
 * hand, and a colour. The new board gets the default statuses and opens.
 */
import { useState, type FormEvent } from 'react';
import {
  BOARD_KEY_MAX_LENGTH,
  boardDocId,
  boardPath,
  createBoard,
  createDefaultStatuses,
  leastUsedColor,
  listBoards,
  normalizeBoardKey,
  suggestBoardKey,
  type ColorName,
} from '@corkboard/model';
import { Dialog } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { ColorSwatches } from '../labels/ColorSwatches.js';

export function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const { workspace, client, router } = useServices();
  const existing = listBoards(workspace, { includeArchived: true });
  const taken = existing.map((entry) => entry.key);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<ColorName>(() => leastUsedColor(existing.map((entry) => entry.color)));
  const [busy, setBusy] = useState(false);
  const shownKey = keyEdited ? key : name.trim() === '' ? '' : suggestBoardKey(name, taken);
  const keyTaken = keyEdited && taken.includes(key);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '' || busy) return;
    setBusy(true);
    const entry = createBoard(workspace, { name, key: shownKey, color });
    const id = boardDocId(entry.id);
    const doc = await client.openDoc(id);
    try {
      createDefaultStatuses(doc);
    } finally {
      client.releaseDoc(id);
    }
    onClose();
    router.navigate(boardPath(entry.key));
  };

  return (
    <Dialog title="New board" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Such as Web app" autoFocus required maxLength={80} />
        </label>
        <div className="field">
          <label htmlFor="new-board-key">Key</label>
          <input
            id="new-board-key"
            className="key-input"
            value={shownKey}
            onChange={(e) => {
              setKeyEdited(true);
              setKey(normalizeBoardKey(e.target.value));
            }}
            maxLength={BOARD_KEY_MAX_LENGTH}
            spellCheck={false}
            autoCapitalize="characters"
            aria-describedby="board-key-hint"
          />
          <small id="board-key-hint" className={`field-hint ${keyTaken ? 'is-error' : ''}`}>
            {keyTaken
              ? `${key} is taken; the board gets the next free key.`
              : `Cards on this board are named ${shownKey || 'KEY'}-1, ${shownKey || 'KEY'}-2 and so on. The key can’t be changed later.`}
          </small>
        </div>
        <ColorSwatches value={color} onChange={setColor} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={name.trim() === '' || busy}>
            Create board
          </button>
        </div>
      </form>
    </Dialog>
  );
}
