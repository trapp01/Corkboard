/**
 * The page's side of the desktop app's server. In the app this page is served
 * by a Corkboard server running on this computer; the page syncs with it like
 * a browser with any server, learning its address and token from the bridge
 * instead of asking for them. Absent in a browser.
 */
import { normalizeServerAddress, type SyncClient } from '@corkboard/sync';
import type { AppServerState, ShellBridge } from '../shell-bridge.js';
import type { Store } from '../app/store.js';

/**
 * Points the sync client at the app's server, unless it already syncs with it
 * using the same token. Its port can differ from the last launch when 8422
 * was taken, so this runs at every start.
 */
export async function syncWithAppServer(client: SyncClient, bridge: ShellBridge): Promise<void> {
  const access = await bridge.serverAccess();
  if (client.server?.address === normalizeServerAddress(access.url) && client.server.token === access.token) return;
  await client.connect(access);
}

/** Keeps `store` equal to the app server's state as the bridge reports it. */
export function followAppServer(bridge: ShellBridge, store: Store<AppServerState | null>): void {
  bridge.onServerState((state) => store.set(state));
  bridge.serverState().then(
    (state) => store.set(state),
    (error: unknown) => console.error("Could not read the app server's state", error),
  );
}
