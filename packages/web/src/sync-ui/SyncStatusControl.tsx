/**
 * The sync status control in the top bar: a small icon and a short label for
 * the current state. Pressing it opens the details: server, last synced time,
 * items still to send, the last error and "Retry now". In the desktop app the
 * server shown is the server to sync with, and the app's server retries that
 * link itself.
 */
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CloudCheck, CloudOff, Laptop, RefreshCw, type LucideIcon } from 'lucide-react';
import type { SyncStatus } from '@corkboard/sync';
import { Popover } from '../app/controls.js';
import { useServices } from '../app/services.js';
import { useStore } from '../app/store.js';
import { patchUi } from '../app/ui-state.js';
import { describeTime } from '../app/time.js';
import { describeStatus, type StatusTone } from './status-label.js';
import { useSyncStatus } from './use-sync-status.js';

const ICONS: Record<StatusTone, LucideIcon> = {
  ok: CloudCheck,
  busy: RefreshCw,
  offline: CloudOff,
  error: CircleAlert,
  local: Laptop,
};

export function SyncStatusControl({ compact = false }: { compact?: boolean }) {
  const { client, appServer } = useServices();
  const status = useSyncStatus(client);
  const label = describeStatus(status, useStore(appServer));
  const Icon = ICONS[label.tone];
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={button}
        className={`sync-status tone-${label.tone} ${compact ? 'is-compact' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Sync: ${label.label}`}
        title={label.label}
        data-state={status.state}
      >
        <Icon size={18} className={label.tone === 'busy' ? 'spin' : undefined} aria-hidden="true" />
        {!compact && <span className="sync-status-label">{label.label}</span>}
      </button>
      {open && (
        <Popover anchor={button.current} onClose={() => setOpen(false)} align="end" className="sync-details">
          <SyncDetails status={status} onClose={() => setOpen(false)} />
        </Popover>
      )}
    </>
  );
}

export function SyncDetails({ status, onClose }: { status: SyncStatus; onClose?: () => void }) {
  const { client, ui, appServer } = useServices();
  const app = useStore(appServer);
  const label = describeStatus(status, app);
  const server = app ? (app.upstream?.url ?? null) : status.server;
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const toSend = status.unsentDocs + status.unsentBlobs;
  return (
    <div className="sync-details-body">
      <p className="sync-details-lead">{label.detail}</p>
      <dl className="details-list">
        <dt>Server</dt>
        <dd>{server ?? 'None'}</dd>
        {status.server && !app && (
          <>
            <dt>Last synced</dt>
            <dd>{describeTime(status.lastSyncedAt)}</dd>
          </>
        )}
        <dt>Still to send</dt>
        <dd>{toSend === 0 ? 'Nothing' : `${status.unsentDocs === 1 ? '1 board' : `${status.unsentDocs} boards`}, ${status.unsentBlobs === 1 ? '1 file' : `${status.unsentBlobs} files`}`}</dd>
        {status.unstoredDocs > 0 && (
          <>
            <dt>Not saved</dt>
            <dd className="details-error">
              Couldn’t save changes to {status.unstoredDocs === 1 ? '1 board' : `${status.unstoredDocs} boards`} on this device
              {status.lastError?.kind === 'store' ? `: ${status.lastError.message}` : '.'} They stay open and are tried again.
            </dd>
          </>
        )}
        {status.failedDocs.length > 0 && (
          <>
            <dt>Not synced</dt>
            <dd className="details-error">
              {status.failedDocs.length === 1 ? '1 board' : `${status.failedDocs.length} boards`} couldn’t sync this time. They’re tried again on
              the next connection.
            </dd>
          </>
        )}
        {status.lastError && !(status.unstoredDocs > 0 && status.lastError.kind === 'store') && (
          <>
            <dt>Last error</dt>
            <dd className="details-error">{status.lastError.message}</dd>
          </>
        )}
      </dl>
      <div className="form-actions">
        {onClose && (
          <button
            className="button"
            onClick={() => {
              onClose();
              patchUi(ui, { dialog: { kind: 'settings' } });
            }}
          >
            Settings
          </button>
        )}
        {status.server && !app && (
          <button className="button primary" disabled={status.state !== 'offline'} onClick={() => client.retryNow()}>
            Retry now
          </button>
        )}
      </div>
    </div>
  );
}
