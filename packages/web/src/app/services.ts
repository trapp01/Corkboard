/**
 * The app's long-lived objects, created once per session over one sync
 * client. Components get them through `useServices()`; nothing else holds
 * global state. The actor and theme are per-device settings kept in
 * localStorage and saved whenever they change.
 */
import { createContext, useContext } from 'react';
import type * as Y from 'yjs';
import { WORKSPACE_DOC_ID } from '@corkboard/model';
import type { SyncClient } from '@corkboard/sync';
import { BlobUrlCache, retryMissingOnSync } from '../card/blob-urls.js';
import { readLocal, writeLocal } from './local-settings.js';
import { Router } from './router.js';
import { Store } from './store.js';
import { Toasts } from './toasts.js';
import { createUiState, type Hover, type UiState } from './ui-state.js';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Services {
  client: SyncClient;
  workspace: Y.Doc;
  router: Router;
  ui: Store<UiState>;
  hover: Store<Hover>;
  /** The name recorded on every change made in this browser; '' until first run asks for it. */
  actor: Store<string>;
  theme: Store<ThemeChoice>;
  toasts: Toasts;
  blobs: BlobUrlCache;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices needs a ServicesContext provider');
  return services;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A store whose value is read from and written back to localStorage under `key`. */
function localStore<T>(key: string, fallback: T): Store<T> {
  const store = new Store<T>(readLocal(key, fallback));
  store.subscribe(() => writeLocal(key, store.get()));
  return store;
}

export async function createServices(client: SyncClient): Promise<Services> {
  const workspace = await client.openDoc(WORKSPACE_DOC_ID);
  const services: Services = {
    client,
    workspace,
    router: new Router(),
    ui: createUiState(),
    hover: new Store<Hover>({ statusId: null, cardId: null }),
    actor: localStore('actor', ''),
    theme: localStore<ThemeChoice>('theme', 'system'),
    toasts: new Toasts(),
    blobs: new BlobUrlCache({ getBlob: (hash) => client.getBlob(hash) }),
  };
  applyTheme(services.theme.get());
  services.theme.subscribe(() => applyTheme(services.theme.get()));
  retryMissingOnSync(client, services.blobs);
  return services;
}

/** Light or dark follows the system unless the person picked one in Settings. */
function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
