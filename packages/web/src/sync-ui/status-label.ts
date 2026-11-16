/**
 * What the sync status control says for each SyncStatus: a short label, a
 * tone for the icon, and the longer sentence the details popover leads with.
 */
import type { SyncStatus } from '@corkboard/sync';

export type StatusTone = 'ok' | 'busy' | 'offline' | 'error' | 'local';

export interface StatusLabel {
  tone: StatusTone;
  label: string;
  detail: string;
}

export function describeStatus(status: SyncStatus): StatusLabel {
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
