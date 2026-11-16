/**
 * The link from this server to an upstream Corkboard server, for a local
 * copy that follows a server elsewhere. This server connects as a sync
 * client, hands the socket to the hub once welcomed, and copies blobs both
 * ways over HTTP. It reconnects with backoff, and every connect repeats the
 * handshake for every doc, so whatever either side changed while apart is
 * exchanged. With no upstream configured none of this exists.
 */
import WebSocket from 'ws';
import { BLOBS_PATH, CLOSE_BAD_TOKEN, WELCOME_TIMEOUT_MS, decodeWelcome, encodeHello, routeUrl, socketUrl, type BlobList } from '@corkboard/sync';
import type { DiskStore } from './disk-store.js';
import type { Hub } from './hub.js';

export interface UpstreamAccess {
  /** The upstream server's address, e.g. `http://nas:8422`. */
  url: string;
  token: string;
}

export const UPSTREAM_RETRY_MIN_MS = 1000;
export const UPSTREAM_RETRY_MAX_MS = 30_000;
/** Blobs are compared with the upstream this long after the last doc change, so one edit burst checks once. */
export const UPSTREAM_BLOB_DELAY_MS = 3000;
/** One blob request to the upstream may take this long before it is given up until the next comparison. */
export const UPSTREAM_BLOB_TIMEOUT_MS = 60_000;

export class Upstream {
  private socket: WebSocket | null = null;
  private welcomed = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private blobTimer: ReturnType<typeof setTimeout> | null = null;
  private blobRun: Promise<void> = Promise.resolve();
  /** Aborted at close, so a blob request in flight never holds up shutdown. */
  private readonly stopping = new AbortController();
  private closed = false;

  constructor(
    private readonly hub: Hub,
    private readonly store: DiskStore,
    private readonly access: UpstreamAccess,
    private readonly retryMs: { min: number; max: number } = { min: UPSTREAM_RETRY_MIN_MS, max: UPSTREAM_RETRY_MAX_MS },
  ) {}

  /** True once the upstream has welcomed this server and until the socket closes. */
  get connected(): boolean {
    return this.welcomed;
  }

  start(): void {
    this.connect();
  }

  /** Tells the link a doc changed here, from any source, so blobs the change may refer to get compared soon. */
  docStored(): void {
    if (!this.welcomed || this.blobTimer !== null) return;
    this.blobTimer = setTimeout(() => {
      this.blobTimer = null;
      this.syncBlobs();
    }, UPSTREAM_BLOB_DELAY_MS);
    this.blobTimer.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.blobTimer !== null) clearTimeout(this.blobTimer);
    this.stopping.abort();
    this.socket?.close(1001, 'server shutting down');
    await this.blobRun;
  }

  private connect(): void {
    if (this.closed) return;
    const socket = new WebSocket(socketUrl(this.access.url));
    this.socket = socket;
    socket.on('open', () => socket.send(encodeHello(this.access.token, 'corkboard-server')));
    // Something that accepts the socket but never welcomes it is not a Corkboard server, or is stuck; try again.
    const welcomeTimer = setTimeout(() => socket.terminate(), WELCOME_TIMEOUT_MS);
    welcomeTimer.unref();
    socket.once('message', (data, isBinary) => {
      clearTimeout(welcomeTimer);
      if (isBinary) return socket.close(1002, 'expected a welcome');
      let docs: string[];
      try {
        docs = decodeWelcome(data.toString()).docs;
      } catch (error) {
        console.error('The upstream server sent a welcome this server cannot read', error);
        return socket.close(1002, 'unreadable welcome');
      }
      this.welcomed = true;
      this.attempt = 0;
      console.log(`Connected to the upstream server at ${this.access.url}`);
      void this.hub.attachUpstream(socket, docs).catch((error: unknown) => console.error('Could not start the handshake with the upstream server', error));
      this.syncBlobs();
    });
    socket.on('error', (error) => {
      // A refused connection also emits close, which schedules the retry.
      if (this.attempt === 0) console.warn(`Upstream server at ${this.access.url}: ${error.message}`);
    });
    socket.on('close', (code) => {
      clearTimeout(welcomeTimer);
      const wasWelcomed = this.welcomed;
      this.welcomed = false;
      this.socket = null;
      if (this.closed) return;
      if (code === CLOSE_BAD_TOKEN) {
        console.error(`The upstream server at ${this.access.url} refused the token in CORKBOARD_UPSTREAM_TOKEN; not retrying until restart`);
        return;
      }
      if (wasWelcomed) console.warn(`Lost the upstream server at ${this.access.url}; reconnecting`);
      const bound = Math.min(this.retryMs.max, this.retryMs.min * 2 ** this.attempt++);
      this.retryTimer = setTimeout(() => this.connect(), bound / 2 + Math.random() * (bound / 2));
      this.retryTimer.unref();
    });
  }

  /** Copies every blob one side has and the other lacks. Runs are queued, never overlapped. */
  private syncBlobs(): void {
    this.blobRun = this.blobRun.then(async () => {
      if (!this.welcomed) return;
      try {
        const headers = { Authorization: `Bearer ${this.access.token}` };
        const signal = () => AbortSignal.any([this.stopping.signal, AbortSignal.timeout(UPSTREAM_BLOB_TIMEOUT_MS)]);
        const listed = await fetch(routeUrl(this.access.url, BLOBS_PATH), { headers, signal: signal() });
        if (!listed.ok) throw new Error(`listing blobs answered ${listed.status}`);
        const theirs = new Set(((await listed.json()) as BlobList).blobs);
        const ours = new Set(await this.store.listBlobs());
        for (const hash of ours) {
          if (theirs.has(hash)) continue;
          const bytes = await this.store.getBlob(hash);
          if (bytes === null) continue;
          const sent = await fetch(routeUrl(this.access.url, `${BLOBS_PATH}/${hash}`), { method: 'PUT', headers, body: bytes, signal: signal() });
          if (!sent.ok) throw new Error(`sending blob ${hash} answered ${sent.status}`);
        }
        for (const hash of theirs) {
          if (ours.has(hash)) continue;
          const got = await fetch(routeUrl(this.access.url, `${BLOBS_PATH}/${hash}`), { headers, signal: signal() });
          if (!got.ok) throw new Error(`fetching blob ${hash} answered ${got.status}`);
          await this.store.putBlob(new Uint8Array(await got.arrayBuffer()));
        }
      } catch (error) {
        if (this.closed) return;
        // The next doc change or reconnect compares again.
        console.warn(`Could not copy blobs with the upstream server: ${(error as Error).message}`);
      }
    });
  }
}
