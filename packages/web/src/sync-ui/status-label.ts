/**
 * What the sync status control says for each SyncStatus: a short label, a
 * tone for the icon, and the longer sentence the details popover leads with.
 * In the desktop app the page always syncs with the app's own server, so once
 * it is in step the label speaks for the link from that server to the server
 * to sync with, or says the boards are on this computer only.
 */
import type { SyncStatus } from '@corkboard/sync';
import type { AppServerState } from '../shell-bridge.js';

export type StatusTone = 'ok' | 'busy' | 'offline' | 'error' | 'local';

export interface StatusLabel {
  tone: StatusTone;
  label: string;
  detail: string;
}

export function describeStatus(status: SyncStatus, app: AppServerState | null = null): StatusLabel {
  if (app !== null) return describeAppStatus(status, app);
  const error = status.lastError;
  switch (status.state) {
    case 'no-server':
      return { tone: 'local', label: 'On this device', detail: 'Boards are kept on this device only.' };
    case 'connecting':
      return { tone: 'busy', label: 'Connecting…', detail: `Connecting to ${status.server}.` };
    case 'syncing':
      return {
        tone: 'busy',
        label: status.docsTotal > 0 ? `Syncing ${status.docsDone} of ${status.docsTotal}` : 'Syncing…',
        detail: 'Bringing this device and the server in step.',
      };
    case 'synced':
      return { tone: 'ok', label: 'Synced', detail: 'Everything is in step with the server.' };
    case 'offline':
      if (error?.kind === 'bad-token') {
        return {
          tone: 'error',
          label: 'Wrong access token',
          detail: 'The server refused the access token. Enter the current one in Settings.',
        };
      }
      if (error?.kind === 'protocol') {
        return { tone: 'error', label: 'Can’t sync', detail: 'The server and this app could not agree on how to sync.' };
      }
      return {
        tone: 'offline',
        label: 'Offline — changes are saved on this device',
        detail: 'The server can’t be reached. Changes are saved on this device and sync when it’s back.',
      };
  }
}

function describeAppStatus(status: SyncStatus, app: AppServerState): StatusLabel {
  if (status.state !== 'synced') {
    if (status.state === 'offline' && (status.lastError?.kind === 'bad-token' || status.lastError?.kind === 'protocol')) {
      return { tone: 'error', label: 'Can’t sync', detail: 'This window and the app’s server could not agree on how to sync. Quit and reopen Corkboard.' };
    }
    if (status.state === 'syncing') return describeStatus(status);
    // The app's server restarts after a settings change; the window reconnects on its own.
    return { tone: 'busy', label: 'Connecting…', detail: 'Connecting to the app’s server.' };
  }
  const upstream = app.upstream;
  if (upstream === null) return { tone: 'local', label: 'On this computer', detail: 'Boards are kept on this computer only.' };
  if (upstream.tokenRefused) {
    return {
      tone: 'error',
      label: 'Wrong access token',
      detail: `${upstream.url} refused the access token. Enter the current one in Settings.`,
    };
  }
  // The link being up says changes are travelling, not that a first copy of every board has finished.
  if (upstream.connected) return { tone: 'ok', label: 'Connected', detail: `Boards here and on ${upstream.url} are kept in step.` };
  return {
    tone: 'offline',
    label: 'Offline — changes are saved on this computer',
    detail: `${upstream.url} can’t be reached. Changes are saved on this computer and sync when it’s back.`,
  };
}
