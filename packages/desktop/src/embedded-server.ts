/**
 * The Corkboard server the app runs in its own process, on 127.0.0.1 only:
 * choosing its port, starting it with the saved links to other servers,
 * restarting it when they change, and closing it. Knows nothing about
 * Electron, so it runs in Node tests.
 *
 * The port is 8422 so agents set up for the app keep one address. When
 * something else answers there, the server starts on the port used the last
 * time that happened, else on any free port; the app never fails to start
 * over a port.
 */
import { DEFAULT_PORT, portAnswers, startServer, type RunningServer, type ServerOptions } from '@corkboard/server';
import type { AppServerState, ServerLink } from '../../web/src/shell-bridge.js';
import type { DesktopSettings } from './settings-file.js';

/** The app's server listens here only, so the boards are reachable from this computer and nowhere else. */
export const APP_HOST = '127.0.0.1';
export { DEFAULT_PORT };

/** The ports to try in order: the preferred one, the remembered fallback, then 0 for any free port. */
export function portsToTry(preferred: number, remembered: number | null): number[] {
  const ports = [preferred];
  if (remembered !== null && remembered !== preferred) ports.push(remembered);
  if (preferred !== 0) ports.push(0);
  return ports;
}

function isPortTaken(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}

export interface EmbeddedServerOptions {
  dataDir: string;
  /** The built web client's folder. */
  webDir: string | null;
  /** 8422, or 0 for any free port. */
  preferredPort: number;
  /** Replaced in tests. */
  start?: (options: ServerOptions) => Promise<RunningServer>;
  probe?: (port: number) => Promise<boolean>;
}

export class EmbeddedServer {
  private running: RunningServer | null = null;
  /** The address of the latest start, kept while a restart is in progress. */
  private address: { url: string; port: number } | null = null;
  private settings: DesktopSettings | null = null;
  /** Starts, restarts and closes run one at a time, in the order asked. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: EmbeddedServerOptions) {}

  /** Starts on the first usable port of `portsToTry`. */
  start(settings: DesktopSettings): Promise<void> {
    return this.enqueue(() => this.listen(settings, portsToTry(this.options.preferredPort, settings.fallbackPort)));
  }

  /**
   * Stops the server and starts it again with these settings on the same
   * port, or on a free one if that port was taken in between. Connected
   * windows and agents are dropped and reconnect by themselves. When the new
   * settings cannot be started, the server comes back with the ones before
   * and the call rejects.
   */
  apply(settings: DesktopSettings): Promise<void> {
    return this.enqueue(async () => {
      const port = this.started.port;
      const previous = this.settings;
      try {
        await this.running?.close();
      } catch (error) {
        console.error("The app's server did not close cleanly before its restart", error);
      }
      this.running = null;
      try {
        await this.listen(settings, [port, 0]);
      } catch (error) {
        // Never leave the app with no server: go back to the settings that last worked.
        if (previous !== null) await this.listen(previous, [port, 0]);
        throw error;
      }
    });
  }

  /** False only when a restart failed and the settings before it could not be started again either. */
  get isRunning(): boolean {
    return this.running !== null;
  }

  /** Stores pending writes and closes every connection. Safe to call more than once. */
  close(): Promise<void> {
    return this.enqueue(async () => {
      await this.running?.close();
      this.running = null;
    });
  }

  get port(): number {
    return this.started.port;
  }

  /** The address the window loads and agents use, e.g. `http://127.0.0.1:8422`. It stays set while a restart runs. */
  get url(): string {
    return this.started.url;
  }

  /** True when the preferred port was taken and the server listens on another. */
  get onOtherPort(): boolean {
    return this.options.preferredPort !== 0 && this.started.port !== this.options.preferredPort;
  }

  access(): ServerLink {
    return { url: this.current.url, token: this.current.token };
  }

  state(): AppServerState {
    const settings = this.settings;
    const upstream = this.current.upstream;
    return {
      url: this.current.url,
      upstream:
        settings?.upstream && upstream
          ? { url: settings.upstream.url, connected: upstream.connected, tokenRefused: upstream.tokenRefused }
          : null,
      looseleaf: settings?.looseleaf ? { url: settings.looseleaf.url } : null,
    };
  }

  private get started(): { url: string; port: number } {
    if (this.address === null) throw new Error("The app's server has not started");
    return this.address;
  }

  private get current(): RunningServer {
    if (this.running === null) throw new Error("The app's server is not running");
    return this.running;
  }

  private async listen(settings: DesktopSettings, ports: number[]): Promise<void> {
    const start = this.options.start ?? startServer;
    const probe = this.options.probe ?? portAnswers;
    for (const port of ports) {
      if (port !== 0 && (await probe(port))) continue;
      try {
        this.running = await start({
          dataDir: this.options.dataDir,
          webDir: this.options.webDir,
          port,
          host: APP_HOST,
          upstream: settings.upstream,
          looseleaf: settings.looseleaf,
        });
        this.settings = settings;
        this.address = { url: this.running.url, port: this.running.port };
        return;
      } catch (error) {
        if (port === 0 || !isPortTaken(error)) throw error;
      }
    }
    throw new Error(`No port to listen on among ${ports.join(', ')}`);
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
