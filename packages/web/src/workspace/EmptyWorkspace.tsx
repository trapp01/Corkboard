/** What the main area shows with no board to show: no boards yet, or an address naming a board this device lacks. */
import { Plus } from 'lucide-react';
import { useServices } from '../app/services.js';
import { useSyncStatus } from '../sync-ui/use-sync-status.js';
import { patchUi } from '../app/ui-state.js';

export function EmptyWorkspace({ hasArchived }: { hasArchived: boolean }) {
  const { ui } = useServices();
  return (
    <div className="empty-state">
      <h1>No boards yet</h1>
      <p className="muted">
        {hasArchived ? 'Every board is archived. Restore one from the board switcher, or make a new one.' : 'A board holds statuses, and statuses hold cards.'}
      </p>
      <button type="button" className="button primary large" onClick={() => patchUi(ui, { dialog: { kind: 'new-board' } })} autoFocus>
        <Plus size={18} aria-hidden="true" />
        Create a board
      </button>
    </div>
  );
}

export function MissingBoard({ boardKey }: { boardKey: string }) {
  const { router, client } = useServices();
  const status = useSyncStatus(client);
  const waiting = status.state === 'connecting' || status.state === 'syncing';
  return (
    <div className="empty-state">
      <h1>{waiting ? `Looking for ${boardKey}…` : `No board has the key ${boardKey}`}</h1>
      {!waiting && <p className="muted">It may have been made on a device that hasn’t synced yet.</p>}
      <button type="button" className="button" onClick={() => router.navigate('/')}>
        Open my boards
      </button>
    </div>
  );
}
