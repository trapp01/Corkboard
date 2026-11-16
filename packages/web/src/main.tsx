/**
 * Starts the app: opens the replica store in IndexedDB, creates the one sync
 * client and the services over it, and renders. When IndexedDB cannot be
 * opened (some private windows) the replica lives in memory for the session
 * and the app says so. In the desktop app the client syncs with the app's
 * own server before anything renders.
 */
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-mono/400.css';
import '@fontsource/atkinson-hyperlegible-mono/600.css';
import './styles/tokens.css';
import './styles/colors.css';
import './styles/base.css';
import './app/app.css';
import './board/board.css';
import './card/card-front.css';
import './card/card-back.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryStore, openIndexedDbStore, SyncClient, type ClientStore } from '@corkboard/sync';
import { Boot } from './app/Boot.js';
import { createServices, ServicesContext } from './app/services.js';
import { registerServiceWorker } from './app/service-worker.js';
import { syncWithAppServer } from './desktop/app-server.js';
import { shell } from './shell-bridge.js';

async function start(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  let store: ClientStore;
  let persistent = true;
  try {
    store = await openIndexedDbStore();
  } catch (error) {
    console.error('Could not open IndexedDB; boards stay in memory for this session', error);
    store = new MemoryStore();
    persistent = false;
  }
  const client = await SyncClient.create({ store });
  const bridge = shell();
  if (bridge) {
    document.documentElement.dataset.shell = bridge.platform;
    await syncWithAppServer(client, bridge);
  }
  const services = await createServices(client);
  window.addEventListener('online', () => client.retryNow());
  root.render(
    <StrictMode>
      <ServicesContext.Provider value={services}>
        <Boot persistent={persistent} />
      </ServicesContext.Provider>
    </StrictMode>,
  );
  registerServiceWorker();
}

void start();
