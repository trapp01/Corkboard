/**
 * Starts the whole server on one port: HTTP routes, the /sync WebSocket, the
 * MCP endpoint and the daily snapshots, over one data folder, plus the link
 * to an upstream server when one is configured. `main.ts` calls this with the
 * environment's settings; tests call it directly.
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { SYNC_PATH } from '@corkboard/sync';
import { loadOrCreateToken } from './access-token.js';
import { DiskStore } from './disk-store.js';
import { createHttpHandler } from './http.js';
import { Hub } from './hub.js';
import { Boards } from './boards.js';
import { Looseleaf, type LooseleafAccess } from './looseleaf.js';
import { Upstream, type UpstreamAccess } from './upstream.js';
import { DEFAULT_SNAPSHOT_KEEP, startSnapshots } from './snapshots.js';
import packageJson from '../package.json' with { type: 'json' };

/** Uploads larger than this are refused unless CORKBOARD_MAX_BLOB_BYTES says otherwise. */
export const DEFAULT_MAX_BLOB_BYTES = 200 * 1024 * 1024;
export const DEFAULT_PORT = 8422;

export interface ServerOptions {
  dataDir: string;
  /** 0 picks a free port. */
  port: number;
  /** The interface to listen on, such as `127.0.0.1` for this computer only. Every interface when left out. */
  host?: string;
  /** When unset, the token is read from or generated into data/token. */
  token?: string;
  /** The built web client's folder; ignored unless it holds an index.html. */
  webDir?: string | null;
  maxBlobBytes?: number;
  snapshotKeep?: number;
  /** Docs kept loaded in memory; see DOC_CACHE_SIZE. */
  docCacheSize?: number;
  /** Another Corkboard server this one keeps in step with; none when left out. */
  upstream?: UpstreamAccess | null;
  /** Backoff bounds for reconnecting to the upstream. */
  upstreamRetryMs?: { min: number; max: number };
  /** The Looseleaf server that pages linked from cards are read from; none when left out. */
  looseleaf?: LooseleafAccess | null;
}

export interface RunningServer {
  port: number;
  /** The address clients connect to, e.g. http://127.0.0.1:8422. */
  url: string;
  token: string;
  /** True when this start generated the token and wrote it to data/token. */
  tokenGenerated: boolean;
  tokenSource: string;
  /** Null when no web client is served. */
  webDir: string | null;
  hub: Hub;
  store: DiskStore;
  boards: Boards;
  /** Null when no upstream server is configured. */
  upstream: Upstream | null;
  /** Stops accepting work, closes every socket, waits for pending writes and a snapshot in progress. */
  close(): Promise<void>;
}

export const SERVER_VERSION: string = packageJson.version;
export { portAnswers } from './port.js';

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const store = new DiskStore(options.dataDir);
  await store.init();
  const access = await loadOrCreateToken(options.dataDir, options.token);
  const webDir = await usableWebDir(options.webDir ?? null);
  let upstream: Upstream | null = null;
  const hub: Hub = new Hub(store, access.token, {
    docCacheSize: options.docCacheSize,
    onDocStored: (docId) => {
      void boards.repair(docId).catch((error: unknown) => console.error(`Could not repair doc "${docId}" after a change`, error));
      upstream?.docStored();
    },
  });
  const boards = new Boards(hub);
  if (options.upstream) upstream = new Upstream(hub, store, options.upstream, options.upstreamRetryMs);
  const http = createServer(
    createHttpHandler({
      store,
      token: access.token,
      version: SERVER_VERSION,
      maxBlobBytes: options.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES,
      webDir,
      boards,
      looseleaf: options.looseleaf ? new Looseleaf(options.looseleaf) : null,
      onBlobStored: () => upstream?.docStored(),
    }),
  );
  const sockets = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req, socket: Duplex, head) => {
    const path = new URL(req.url ?? '/', 'http://server').pathname;
    if (path !== SYNC_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => hub.accept(ws, req.socket.remoteAddress ?? 'unknown'));
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host, () => {
      http.off('error', reject);
      resolve();
    });
  });
  const address = http.address();
  if (address === null || typeof address === 'string') throw new Error('The HTTP server has no TCP address');
  const stopSnapshots = startSnapshots(store, options.snapshotKeep ?? DEFAULT_SNAPSHOT_KEEP);
  upstream?.start();

  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      const httpClosed = new Promise<void>((resolve) => http.close(() => resolve()));
      await upstream?.close();
      await hub.close();
      sockets.close();
      http.closeAllConnections();
      await httpClosed;
      await store.drain();
      await stopSnapshots();
    })();
    return closing;
  };

  return {
    port: address.port,
    url: `http://${urlHost(options.host)}:${address.port}`,
    token: access.token,
    tokenGenerated: access.generated,
    tokenSource: access.source,
    webDir,
    hub,
    store,
    boards,
    upstream,
    close,
  };
}

/** The host in `RunningServer.url`: the one listened on, or 127.0.0.1 when that is every interface. */
function urlHost(host: string | undefined): string {
  if (host === undefined || host === '' || host === '0.0.0.0' || host === '::') return '127.0.0.1';
  return host.includes(':') ? `[${host}]` : host;
}

async function usableWebDir(webDir: string | null): Promise<string | null> {
  if (webDir === null || webDir === '') return null;
  try {
    return (await stat(join(webDir, 'index.html'))).isFile() ? webDir : null;
  } catch {
    console.warn(`CORKBOARD_WEB_DIR is set to ${webDir}, but it has no index.html; serving no web client`);
    return null;
  }
}
